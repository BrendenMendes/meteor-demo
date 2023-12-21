(function () {

/* Imports */
var Meteor = Package.meteor.Meteor;
var global = Package.meteor.global;
var meteorEnv = Package.meteor.meteorEnv;
var Tracker = Package.tracker.Tracker;
var Deps = Package.tracker.Deps;
var MongoID = Package['mongo-id'].MongoID;
var DiffSequence = Package['diff-sequence'].DiffSequence;
var Random = Package.random.Random;
var ECMAScript = Package.ecmascript.ECMAScript;
var meteorInstall = Package.modules.meteorInstall;
var Promise = Package.promise.Promise;

/* Package-scope variables */
var ObserveSequence, seqChangedToEmpty, seqChangedToArray, seqChangedToCursor;

var require = meteorInstall({"node_modules":{"meteor":{"observe-sequence":{"observe_sequence.js":function module(){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                             //
// packages/observe-sequence/observe_sequence.js                                                               //
//                                                                                                             //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                               //
const isObject = function (value) {
  var type = typeof value;
  return value != null && (type == 'object' || type == 'function');
};
const has = function (obj, key) {
  var keyParts = key.split('.');
  return !!obj && (keyParts.length > 1 ? has(obj[key.split('.')[0]], keyParts.slice(1).join('.')) : hasOwnProperty.call(obj, key));
};
const warn = function () {
  if (ObserveSequence._suppressWarnings) {
    ObserveSequence._suppressWarnings--;
  } else {
    if (typeof console !== 'undefined' && console.warn) console.warn.apply(console, arguments);
    ObserveSequence._loggedWarnings++;
  }
};

// isArray returns true for arrays of these types:
// standard arrays: instanceof Array === true, _.isArray(arr) === true
// vm generated arrays: instanceOf Array === false, _.isArray(arr) === true
// subclassed arrays: instanceof Array === true, _.isArray(arr) === false
// see specific tests
function isArray(arr) {
  return arr instanceof Array || Array.isArray(arr);
}

// isIterable returns trues for objects implementing iterable protocol,
// except strings, as {{#each 'string'}} doesn't make much sense.
// Requires ES6+ and does not work in IE (but degrades gracefully).
// Does not support the `length` + index protocol also supported by Array.from
function isIterable(object) {
  const iter = typeof Symbol != 'undefined' && Symbol.iterator;
  return iter && object instanceof Object // note: returns false for strings
  && typeof object[iter] == 'function'; // implements iterable protocol
}

const idStringify = MongoID.idStringify;
const idParse = MongoID.idParse;
ObserveSequence = {
  _suppressWarnings: 0,
  _loggedWarnings: 0,
  // A mechanism similar to cursor.observe which receives a reactive
  // function returning a sequence type and firing appropriate callbacks
  // when the value changes.
  //
  // @param sequenceFunc {Function} a reactive function returning a
  //     sequence type. The currently supported sequence types are:
  //     Array, Cursor, and null.
  //
  // @param callbacks {Object} similar to a specific subset of
  //     callbacks passed to `cursor.observe`
  //     (http://docs.meteor.com/#observe), with minor variations to
  //     support the fact that not all sequences contain objects with
  //     _id fields.  Specifically:
  //
  //     * addedAt(id, item, atIndex, beforeId)
  //     * changedAt(id, newItem, oldItem, atIndex)
  //     * removedAt(id, oldItem, atIndex)
  //     * movedTo(id, item, fromIndex, toIndex, beforeId)
  //
  // @returns {Object(stop: Function)} call 'stop' on the return value
  //     to stop observing this sequence function.
  //
  // We don't make any assumptions about our ability to compare sequence
  // elements (ie, we don't assume EJSON.equals works; maybe there is extra
  // state/random methods on the objects) so unlike cursor.observe, we may
  // sometimes call changedAt() when nothing actually changed.
  // XXX consider if we *can* make the stronger assumption and avoid
  //     no-op changedAt calls (in some cases?)
  //
  // XXX currently only supports the callbacks used by our
  // implementation of {{#each}}, but this can be expanded.
  //
  // XXX #each doesn't use the indices (though we'll eventually need
  // a way to get them when we support `@index`), but calling
  // `cursor.observe` causes the index to be calculated on every
  // callback using a linear scan (unless you turn it off by passing
  // `_no_indices`).  Any way to avoid calculating indices on a pure
  // cursor observe like we used to?
  observe: function (sequenceFunc, callbacks) {
    var lastSeq = null;
    var activeObserveHandle = null;

    // 'lastSeqArray' contains the previous value of the sequence
    // we're observing. It is an array of objects with '_id' and
    // 'item' fields.  'item' is the element in the array, or the
    // document in the cursor.
    //
    // '_id' is whichever of the following is relevant, unless it has
    // already appeared -- in which case it's randomly generated.
    //
    // * if 'item' is an object:
    //   * an '_id' field, if present
    //   * otherwise, the index in the array
    //
    // * if 'item' is a number or string, use that value
    //
    // XXX this can be generalized by allowing {{#each}} to accept a
    // general 'key' argument which could be a function, a dotted
    // field name, or the special @index value.
    var lastSeqArray = []; // elements are objects of form {_id, item}
    var computation = Tracker.autorun(function () {
      var seq = sequenceFunc();
      Tracker.nonreactive(function () {
        var seqArray; // same structure as `lastSeqArray` above.

        if (activeObserveHandle) {
          // If we were previously observing a cursor, replace lastSeqArray with
          // more up-to-date information.  Then stop the old observe.
          lastSeqArray = lastSeq.fetch().map(function (doc) {
            return {
              _id: doc._id,
              item: doc
            };
          });
          activeObserveHandle.stop();
          activeObserveHandle = null;
        }
        if (!seq) {
          seqArray = seqChangedToEmpty(lastSeqArray, callbacks);
        } else if (isArray(seq)) {
          seqArray = seqChangedToArray(lastSeqArray, seq, callbacks);
        } else if (isStoreCursor(seq)) {
          var result /* [seqArray, activeObserveHandle] */ = seqChangedToCursor(lastSeqArray, seq, callbacks);
          seqArray = result[0];
          activeObserveHandle = result[1];
        } else if (isIterable(seq)) {
          const array = Array.from(seq);
          seqArray = seqChangedToArray(lastSeqArray, array, callbacks);
        } else {
          throw badSequenceError(seq);
        }
        diffArray(lastSeqArray, seqArray, callbacks);
        lastSeq = seq;
        lastSeqArray = seqArray;
      });
    });
    return {
      stop: function () {
        computation.stop();
        if (activeObserveHandle) activeObserveHandle.stop();
      }
    };
  },
  // Fetch the items of `seq` into an array, where `seq` is of one of the
  // sequence types accepted by `observe`.  If `seq` is a cursor, a
  // dependency is established.
  fetch: function (seq) {
    if (!seq) {
      return [];
    } else if (isArray(seq)) {
      return seq;
    } else if (isStoreCursor(seq)) {
      return seq.fetch();
    } else if (isIterable(seq)) {
      return Array.from(seq);
    } else {
      throw badSequenceError(seq);
    }
  }
};
function ellipsis(longStr, maxLength) {
  if (!maxLength) maxLength = 100;
  if (longStr.length < maxLength) return longStr;
  return longStr.substr(0, maxLength - 1) + '…';
}
function arrayToDebugStr(value, maxLength) {
  var out = '',
    sep = '';
  for (var i = 0; i < value.length; i++) {
    var item = value[i];
    out += sep + toDebugStr(item, maxLength);
    if (out.length > maxLength) return out;
    sep = ', ';
  }
  return out;
}
function toDebugStr(value, maxLength) {
  if (!maxLength) maxLength = 150;
  const type = typeof value;
  switch (type) {
    case 'undefined':
      return type;
    case 'number':
      return value.toString();
    case 'string':
      return JSON.stringify(value);
    // add quotes
    case 'object':
      if (value === null) {
        return 'null';
      } else if (Array.isArray(value)) {
        return 'Array [' + arrayToDebugStr(value, maxLength) + ']';
      } else if (Symbol.iterator in value) {
        // Map and Set are not handled by JSON.stringify
        return value.constructor.name + ' [' + arrayToDebugStr(Array.from(value), maxLength) + ']'; // Array.from doesn't work in IE, but neither do iterators so it's unreachable
      } else {
        // use JSON.stringify (sometimes toString can be better but we don't know)
        return value.constructor.name + ' ' + ellipsis(JSON.stringify(value), maxLength);
      }
    default:
      return type + ': ' + value.toString();
  }
}
function sequenceGotValue(sequence) {
  try {
    return ' Got ' + toDebugStr(sequence);
  } catch (e) {
    return '';
  }
}
const badSequenceError = function (sequence) {
  return new Error("{{#each}} currently only accepts " + "arrays, cursors, iterables or falsey values." + sequenceGotValue(sequence));
};
const isFunction = func => {
  return typeof func === "function";
};
const isStoreCursor = function (cursor) {
  return cursor && isObject(cursor) && isFunction(cursor.observe) && isFunction(cursor.fetch);
};

// Calculates the differences between `lastSeqArray` and
// `seqArray` and calls appropriate functions from `callbacks`.
// Reuses Minimongo's diff algorithm implementation.
const diffArray = function (lastSeqArray, seqArray, callbacks) {
  var diffFn = Package['diff-sequence'].DiffSequence.diffQueryOrderedChanges;
  var oldIdObjects = [];
  var newIdObjects = [];
  var posOld = {}; // maps from idStringify'd ids
  var posNew = {}; // ditto
  var posCur = {};
  var lengthCur = lastSeqArray.length;
  seqArray.forEach(function (doc, i) {
    newIdObjects.push({
      _id: doc._id
    });
    posNew[idStringify(doc._id)] = i;
  });
  lastSeqArray.forEach(function (doc, i) {
    oldIdObjects.push({
      _id: doc._id
    });
    posOld[idStringify(doc._id)] = i;
    posCur[idStringify(doc._id)] = i;
  });

  // Arrays can contain arbitrary objects. We don't diff the
  // objects. Instead we always fire 'changedAt' callback on every
  // object. The consumer of `observe-sequence` should deal with
  // it appropriately.
  diffFn(oldIdObjects, newIdObjects, {
    addedBefore: function (id, doc, before) {
      var position = before ? posCur[idStringify(before)] : lengthCur;
      if (before) {
        // If not adding at the end, we need to update indexes.
        // XXX this can still be improved greatly!
        Object.entries(posCur).forEach(function (_ref) {
          let [id, pos] = _ref;
          if (pos >= position) posCur[id]++;
        });
      }
      lengthCur++;
      posCur[idStringify(id)] = position;
      callbacks.addedAt(id, seqArray[posNew[idStringify(id)]].item, position, before);
    },
    movedBefore: function (id, before) {
      if (id === before) return;
      var oldPosition = posCur[idStringify(id)];
      var newPosition = before ? posCur[idStringify(before)] : lengthCur;

      // Moving the item forward. The new element is losing one position as it
      // was removed from the old position before being inserted at the new
      // position.
      // Ex.:   0  *1*  2   3   4
      //        0   2   3  *1*  4
      // The original issued callback is "1" before "4".
      // The position of "1" is 1, the position of "4" is 4.
      // The generated move is (1) -> (3)
      if (newPosition > oldPosition) {
        newPosition--;
      }

      // Fix up the positions of elements between the old and the new positions
      // of the moved element.
      //
      // There are two cases:
      //   1. The element is moved forward. Then all the positions in between
      //   are moved back.
      //   2. The element is moved back. Then the positions in between *and* the
      //   element that is currently standing on the moved element's future
      //   position are moved forward.
      Object.entries(posCur).forEach(function (_ref2) {
        let [id, elCurPosition] = _ref2;
        if (oldPosition < elCurPosition && elCurPosition < newPosition) posCur[id]--;else if (newPosition <= elCurPosition && elCurPosition < oldPosition) posCur[id]++;
      });

      // Finally, update the position of the moved element.
      posCur[idStringify(id)] = newPosition;
      callbacks.movedTo(id, seqArray[posNew[idStringify(id)]].item, oldPosition, newPosition, before);
    },
    removed: function (id) {
      var prevPosition = posCur[idStringify(id)];
      Object.entries(posCur).forEach(function (_ref3) {
        let [id, pos] = _ref3;
        if (pos >= prevPosition) posCur[id]--;
      });
      delete posCur[idStringify(id)];
      lengthCur--;
      callbacks.removedAt(id, lastSeqArray[posOld[idStringify(id)]].item, prevPosition);
    }
  });
  Object.entries(posNew).forEach(function (_ref4) {
    let [idString, pos] = _ref4;
    var id = idParse(idString);
    if (has(posOld, idString)) {
      // specifically for primitive types, compare equality before
      // firing the 'changedAt' callback. otherwise, always fire it
      // because doing a deep EJSON comparison is not guaranteed to
      // work (an array can contain arbitrary objects, and 'transform'
      // can be used on cursors). also, deep diffing is not
      // necessarily the most efficient (if only a specific subfield
      // of the object is later accessed).
      var newItem = seqArray[pos].item;
      var oldItem = lastSeqArray[posOld[idString]].item;
      if (typeof newItem === 'object' || newItem !== oldItem) callbacks.changedAt(id, newItem, oldItem, pos);
    }
  });
};
seqChangedToEmpty = function (lastSeqArray, callbacks) {
  return [];
};
seqChangedToArray = function (lastSeqArray, array, callbacks) {
  var idsUsed = {};
  var seqArray = array.map(function (item, index) {
    var id;
    if (typeof item === 'string') {
      // ensure not empty, since other layers (eg DomRange) assume this as well
      id = "-" + item;
    } else if (typeof item === 'number' || typeof item === 'boolean' || item === undefined || item === null) {
      id = item;
    } else if (typeof item === 'object') {
      id = item && '_id' in item ? item._id : index;
    } else {
      throw new Error("{{#each}} doesn't support arrays with " + "elements of type " + typeof item);
    }
    var idString = idStringify(id);
    if (idsUsed[idString]) {
      if (item && typeof item === 'object' && '_id' in item) warn("duplicate id " + id + " in", array);
      id = Random.id();
    } else {
      idsUsed[idString] = true;
    }
    return {
      _id: id,
      item: item
    };
  });
  return seqArray;
};
seqChangedToCursor = function (lastSeqArray, cursor, callbacks) {
  var initial = true; // are we observing initial data from cursor?
  var seqArray = [];
  var observeHandle = cursor.observe({
    addedAt: function (document, atIndex, before) {
      if (initial) {
        // keep track of initial data so that we can diff once
        // we exit `observe`.
        if (before !== null) throw new Error("Expected initial data from observe in order");
        seqArray.push({
          _id: document._id,
          item: document
        });
      } else {
        callbacks.addedAt(document._id, document, atIndex, before);
      }
    },
    changedAt: function (newDocument, oldDocument, atIndex) {
      callbacks.changedAt(newDocument._id, newDocument, oldDocument, atIndex);
    },
    removedAt: function (oldDocument, atIndex) {
      callbacks.removedAt(oldDocument._id, oldDocument, atIndex);
    },
    movedTo: function (document, fromIndex, toIndex, before) {
      callbacks.movedTo(document._id, document, fromIndex, toIndex, before);
    }
  });
  initial = false;
  return [seqArray, observeHandle];
};
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}}}}},{
  "extensions": [
    ".js",
    ".json"
  ]
});

require("/node_modules/meteor/observe-sequence/observe_sequence.js");

/* Exports */
Package._define("observe-sequence", {
  ObserveSequence: ObserveSequence
});

})();

//# sourceURL=meteor://💻app/packages/observe-sequence.js
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm1ldGVvcjovL/CfkrthcHAvcGFja2FnZXMvb2JzZXJ2ZS1zZXF1ZW5jZS9vYnNlcnZlX3NlcXVlbmNlLmpzIl0sIm5hbWVzIjpbImlzT2JqZWN0IiwidmFsdWUiLCJ0eXBlIiwiaGFzIiwib2JqIiwia2V5Iiwia2V5UGFydHMiLCJzcGxpdCIsImxlbmd0aCIsInNsaWNlIiwiam9pbiIsImhhc093blByb3BlcnR5IiwiY2FsbCIsIndhcm4iLCJPYnNlcnZlU2VxdWVuY2UiLCJfc3VwcHJlc3NXYXJuaW5ncyIsImNvbnNvbGUiLCJhcHBseSIsImFyZ3VtZW50cyIsIl9sb2dnZWRXYXJuaW5ncyIsImlzQXJyYXkiLCJhcnIiLCJBcnJheSIsImlzSXRlcmFibGUiLCJvYmplY3QiLCJpdGVyIiwiU3ltYm9sIiwiaXRlcmF0b3IiLCJPYmplY3QiLCJpZFN0cmluZ2lmeSIsIk1vbmdvSUQiLCJpZFBhcnNlIiwib2JzZXJ2ZSIsInNlcXVlbmNlRnVuYyIsImNhbGxiYWNrcyIsImxhc3RTZXEiLCJhY3RpdmVPYnNlcnZlSGFuZGxlIiwibGFzdFNlcUFycmF5IiwiY29tcHV0YXRpb24iLCJUcmFja2VyIiwiYXV0b3J1biIsInNlcSIsIm5vbnJlYWN0aXZlIiwic2VxQXJyYXkiLCJmZXRjaCIsIm1hcCIsImRvYyIsIl9pZCIsIml0ZW0iLCJzdG9wIiwic2VxQ2hhbmdlZFRvRW1wdHkiLCJzZXFDaGFuZ2VkVG9BcnJheSIsImlzU3RvcmVDdXJzb3IiLCJyZXN1bHQiLCJzZXFDaGFuZ2VkVG9DdXJzb3IiLCJhcnJheSIsImZyb20iLCJiYWRTZXF1ZW5jZUVycm9yIiwiZGlmZkFycmF5IiwiZWxsaXBzaXMiLCJsb25nU3RyIiwibWF4TGVuZ3RoIiwic3Vic3RyIiwiYXJyYXlUb0RlYnVnU3RyIiwib3V0Iiwic2VwIiwiaSIsInRvRGVidWdTdHIiLCJ0b1N0cmluZyIsIkpTT04iLCJzdHJpbmdpZnkiLCJjb25zdHJ1Y3RvciIsIm5hbWUiLCJzZXF1ZW5jZUdvdFZhbHVlIiwic2VxdWVuY2UiLCJlIiwiRXJyb3IiLCJpc0Z1bmN0aW9uIiwiZnVuYyIsImN1cnNvciIsImRpZmZGbiIsIlBhY2thZ2UiLCJEaWZmU2VxdWVuY2UiLCJkaWZmUXVlcnlPcmRlcmVkQ2hhbmdlcyIsIm9sZElkT2JqZWN0cyIsIm5ld0lkT2JqZWN0cyIsInBvc09sZCIsInBvc05ldyIsInBvc0N1ciIsImxlbmd0aEN1ciIsImZvckVhY2giLCJwdXNoIiwiYWRkZWRCZWZvcmUiLCJpZCIsImJlZm9yZSIsInBvc2l0aW9uIiwiZW50cmllcyIsInBvcyIsImFkZGVkQXQiLCJtb3ZlZEJlZm9yZSIsIm9sZFBvc2l0aW9uIiwibmV3UG9zaXRpb24iLCJlbEN1clBvc2l0aW9uIiwibW92ZWRUbyIsInJlbW92ZWQiLCJwcmV2UG9zaXRpb24iLCJyZW1vdmVkQXQiLCJpZFN0cmluZyIsIm5ld0l0ZW0iLCJvbGRJdGVtIiwiY2hhbmdlZEF0IiwiaWRzVXNlZCIsImluZGV4IiwidW5kZWZpbmVkIiwiUmFuZG9tIiwiaW5pdGlhbCIsIm9ic2VydmVIYW5kbGUiLCJkb2N1bWVudCIsImF0SW5kZXgiLCJuZXdEb2N1bWVudCIsIm9sZERvY3VtZW50IiwiZnJvbUluZGV4IiwidG9JbmRleCJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxNQUFNQSxRQUFRLEdBQUcsVUFBVUMsS0FBSyxFQUFFO0VBQ2hDLElBQUlDLElBQUksR0FBRyxPQUFPRCxLQUFLO0VBQ3ZCLE9BQU9BLEtBQUssSUFBSSxJQUFJLEtBQUtDLElBQUksSUFBSSxRQUFRLElBQUlBLElBQUksSUFBSSxVQUFVLENBQUM7QUFDbEUsQ0FBQztBQUNELE1BQU1DLEdBQUcsR0FBRyxVQUFVQyxHQUFHLEVBQUVDLEdBQUcsRUFBRTtFQUM5QixJQUFJQyxRQUFRLEdBQUdELEdBQUcsQ0FBQ0UsS0FBSyxDQUFDLEdBQUcsQ0FBQztFQUU3QixPQUFPLENBQUMsQ0FBQ0gsR0FBRyxLQUNWRSxRQUFRLENBQUNFLE1BQU0sR0FBRyxDQUFDLEdBQ2ZMLEdBQUcsQ0FBQ0MsR0FBRyxDQUFDQyxHQUFHLENBQUNFLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFRCxRQUFRLENBQUNHLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQ0MsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQ3hEQyxjQUFjLENBQUNDLElBQUksQ0FBQ1IsR0FBRyxFQUFFQyxHQUFHLENBQUMsQ0FDbEM7QUFDSCxDQUFDO0FBRUQsTUFBTVEsSUFBSSxHQUFHLFlBQVk7RUFDdkIsSUFBSUMsZUFBZSxDQUFDQyxpQkFBaUIsRUFBRTtJQUNyQ0QsZUFBZSxDQUFDQyxpQkFBaUIsRUFBRTtFQUNyQyxDQUFDLE1BQU07SUFDTCxJQUFJLE9BQU9DLE9BQU8sS0FBSyxXQUFXLElBQUlBLE9BQU8sQ0FBQ0gsSUFBSSxFQUNoREcsT0FBTyxDQUFDSCxJQUFJLENBQUNJLEtBQUssQ0FBQ0QsT0FBTyxFQUFFRSxTQUFTLENBQUM7SUFFeENKLGVBQWUsQ0FBQ0ssZUFBZSxFQUFFO0VBQ25DO0FBQ0YsQ0FBQzs7QUFFRDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsU0FBU0MsT0FBTyxDQUFDQyxHQUFHLEVBQUU7RUFDcEIsT0FBT0EsR0FBRyxZQUFZQyxLQUFLLElBQUlBLEtBQUssQ0FBQ0YsT0FBTyxDQUFDQyxHQUFHLENBQUM7QUFDbkQ7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQSxTQUFTRSxVQUFVLENBQUVDLE1BQU0sRUFBRTtFQUMzQixNQUFNQyxJQUFJLEdBQUcsT0FBT0MsTUFBTSxJQUFJLFdBQVcsSUFBSUEsTUFBTSxDQUFDQyxRQUFRO0VBQzVELE9BQU9GLElBQUksSUFDTkQsTUFBTSxZQUFZSSxNQUFNLENBQUM7RUFBQSxHQUN6QixPQUFPSixNQUFNLENBQUNDLElBQUksQ0FBQyxJQUFJLFVBQVUsQ0FBQyxDQUFDO0FBQzFDOztBQUVBLE1BQU1JLFdBQVcsR0FBR0MsT0FBTyxDQUFDRCxXQUFXO0FBQ3ZDLE1BQU1FLE9BQU8sR0FBR0QsT0FBTyxDQUFDQyxPQUFPO0FBRS9CakIsZUFBZSxHQUFHO0VBQ2hCQyxpQkFBaUIsRUFBRSxDQUFDO0VBQ3BCSSxlQUFlLEVBQUUsQ0FBQztFQUVsQjtFQUNBO0VBQ0E7RUFDQTtFQUNBO0VBQ0E7RUFDQTtFQUNBO0VBQ0E7RUFDQTtFQUNBO0VBQ0E7RUFDQTtFQUNBO0VBQ0E7RUFDQTtFQUNBO0VBQ0E7RUFDQTtFQUNBO0VBQ0E7RUFDQTtFQUNBO0VBQ0E7RUFDQTtFQUNBO0VBQ0E7RUFDQTtFQUNBO0VBQ0E7RUFDQTtFQUNBO0VBQ0E7RUFDQTtFQUNBO0VBQ0E7RUFDQTtFQUNBO0VBQ0FhLE9BQU8sRUFBRSxVQUFVQyxZQUFZLEVBQUVDLFNBQVMsRUFBRTtJQUMxQyxJQUFJQyxPQUFPLEdBQUcsSUFBSTtJQUNsQixJQUFJQyxtQkFBbUIsR0FBRyxJQUFJOztJQUU5QjtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0EsSUFBSUMsWUFBWSxHQUFHLEVBQUUsQ0FBQyxDQUFDO0lBQ3ZCLElBQUlDLFdBQVcsR0FBR0MsT0FBTyxDQUFDQyxPQUFPLENBQUMsWUFBWTtNQUM1QyxJQUFJQyxHQUFHLEdBQUdSLFlBQVksRUFBRTtNQUV4Qk0sT0FBTyxDQUFDRyxXQUFXLENBQUMsWUFBWTtRQUM5QixJQUFJQyxRQUFRLENBQUMsQ0FBQzs7UUFFZCxJQUFJUCxtQkFBbUIsRUFBRTtVQUN2QjtVQUNBO1VBQ0FDLFlBQVksR0FBR0YsT0FBTyxDQUFDUyxLQUFLLEVBQUUsQ0FBQ0MsR0FBRyxDQUFDLFVBQVVDLEdBQUcsRUFBRTtZQUNoRCxPQUFPO2NBQUNDLEdBQUcsRUFBRUQsR0FBRyxDQUFDQyxHQUFHO2NBQUVDLElBQUksRUFBRUY7WUFBRyxDQUFDO1VBQ2xDLENBQUMsQ0FBQztVQUNGVixtQkFBbUIsQ0FBQ2EsSUFBSSxFQUFFO1VBQzFCYixtQkFBbUIsR0FBRyxJQUFJO1FBQzVCO1FBRUEsSUFBSSxDQUFDSyxHQUFHLEVBQUU7VUFDUkUsUUFBUSxHQUFHTyxpQkFBaUIsQ0FBQ2IsWUFBWSxFQUFFSCxTQUFTLENBQUM7UUFDdkQsQ0FBQyxNQUFNLElBQUlkLE9BQU8sQ0FBQ3FCLEdBQUcsQ0FBQyxFQUFFO1VBQ3ZCRSxRQUFRLEdBQUdRLGlCQUFpQixDQUFDZCxZQUFZLEVBQUVJLEdBQUcsRUFBRVAsU0FBUyxDQUFDO1FBQzVELENBQUMsTUFBTSxJQUFJa0IsYUFBYSxDQUFDWCxHQUFHLENBQUMsRUFBRTtVQUM3QixJQUFJWSxNQUFNLENBQUMsd0NBQ0xDLGtCQUFrQixDQUFDakIsWUFBWSxFQUFFSSxHQUFHLEVBQUVQLFNBQVMsQ0FBQztVQUN0RFMsUUFBUSxHQUFHVSxNQUFNLENBQUMsQ0FBQyxDQUFDO1VBQ3BCakIsbUJBQW1CLEdBQUdpQixNQUFNLENBQUMsQ0FBQyxDQUFDO1FBQ2pDLENBQUMsTUFBTSxJQUFJOUIsVUFBVSxDQUFDa0IsR0FBRyxDQUFDLEVBQUU7VUFDMUIsTUFBTWMsS0FBSyxHQUFHakMsS0FBSyxDQUFDa0MsSUFBSSxDQUFDZixHQUFHLENBQUM7VUFDN0JFLFFBQVEsR0FBR1EsaUJBQWlCLENBQUNkLFlBQVksRUFBRWtCLEtBQUssRUFBRXJCLFNBQVMsQ0FBQztRQUM5RCxDQUFDLE1BQU07VUFDTCxNQUFNdUIsZ0JBQWdCLENBQUNoQixHQUFHLENBQUM7UUFDN0I7UUFFQWlCLFNBQVMsQ0FBQ3JCLFlBQVksRUFBRU0sUUFBUSxFQUFFVCxTQUFTLENBQUM7UUFDNUNDLE9BQU8sR0FBR00sR0FBRztRQUNiSixZQUFZLEdBQUdNLFFBQVE7TUFDekIsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDO0lBRUYsT0FBTztNQUNMTSxJQUFJLEVBQUUsWUFBWTtRQUNoQlgsV0FBVyxDQUFDVyxJQUFJLEVBQUU7UUFDbEIsSUFBSWIsbUJBQW1CLEVBQ3JCQSxtQkFBbUIsQ0FBQ2EsSUFBSSxFQUFFO01BQzlCO0lBQ0YsQ0FBQztFQUNILENBQUM7RUFFRDtFQUNBO0VBQ0E7RUFDQUwsS0FBSyxFQUFFLFVBQVVILEdBQUcsRUFBRTtJQUNwQixJQUFJLENBQUNBLEdBQUcsRUFBRTtNQUNSLE9BQU8sRUFBRTtJQUNYLENBQUMsTUFBTSxJQUFJckIsT0FBTyxDQUFDcUIsR0FBRyxDQUFDLEVBQUU7TUFDdkIsT0FBT0EsR0FBRztJQUNaLENBQUMsTUFBTSxJQUFJVyxhQUFhLENBQUNYLEdBQUcsQ0FBQyxFQUFFO01BQzdCLE9BQU9BLEdBQUcsQ0FBQ0csS0FBSyxFQUFFO0lBQ3BCLENBQUMsTUFBTSxJQUFJckIsVUFBVSxDQUFDa0IsR0FBRyxDQUFDLEVBQUU7TUFDMUIsT0FBT25CLEtBQUssQ0FBQ2tDLElBQUksQ0FBQ2YsR0FBRyxDQUFDO0lBQ3hCLENBQUMsTUFBTTtNQUNMLE1BQU1nQixnQkFBZ0IsQ0FBQ2hCLEdBQUcsQ0FBQztJQUM3QjtFQUNGO0FBQ0YsQ0FBQztBQUVELFNBQVNrQixRQUFRLENBQUNDLE9BQU8sRUFBRUMsU0FBUyxFQUFFO0VBQ3BDLElBQUcsQ0FBQ0EsU0FBUyxFQUFFQSxTQUFTLEdBQUcsR0FBRztFQUM5QixJQUFHRCxPQUFPLENBQUNwRCxNQUFNLEdBQUdxRCxTQUFTLEVBQUUsT0FBT0QsT0FBTztFQUM3QyxPQUFPQSxPQUFPLENBQUNFLE1BQU0sQ0FBQyxDQUFDLEVBQUVELFNBQVMsR0FBQyxDQUFDLENBQUMsR0FBRyxHQUFHO0FBQzdDO0FBRUEsU0FBU0UsZUFBZSxDQUFDOUQsS0FBSyxFQUFFNEQsU0FBUyxFQUFFO0VBQ3pDLElBQUlHLEdBQUcsR0FBRyxFQUFFO0lBQUVDLEdBQUcsR0FBRyxFQUFFO0VBQ3RCLEtBQUksSUFBSUMsQ0FBQyxHQUFHLENBQUMsRUFBRUEsQ0FBQyxHQUFHakUsS0FBSyxDQUFDTyxNQUFNLEVBQUUwRCxDQUFDLEVBQUUsRUFBRTtJQUNwQyxJQUFJbEIsSUFBSSxHQUFHL0MsS0FBSyxDQUFDaUUsQ0FBQyxDQUFDO0lBQ25CRixHQUFHLElBQUlDLEdBQUcsR0FBR0UsVUFBVSxDQUFDbkIsSUFBSSxFQUFFYSxTQUFTLENBQUM7SUFDeEMsSUFBR0csR0FBRyxDQUFDeEQsTUFBTSxHQUFHcUQsU0FBUyxFQUFFLE9BQU9HLEdBQUc7SUFDckNDLEdBQUcsR0FBRyxJQUFJO0VBQ1o7RUFDQSxPQUFPRCxHQUFHO0FBQ1o7QUFFQSxTQUFTRyxVQUFVLENBQUNsRSxLQUFLLEVBQUU0RCxTQUFTLEVBQUU7RUFDcEMsSUFBRyxDQUFDQSxTQUFTLEVBQUVBLFNBQVMsR0FBRyxHQUFHO0VBQzlCLE1BQU0zRCxJQUFJLEdBQUcsT0FBT0QsS0FBSztFQUN6QixRQUFPQyxJQUFJO0lBQ1QsS0FBSyxXQUFXO01BQ2QsT0FBT0EsSUFBSTtJQUNiLEtBQUssUUFBUTtNQUNYLE9BQU9ELEtBQUssQ0FBQ21FLFFBQVEsRUFBRTtJQUN6QixLQUFLLFFBQVE7TUFDWCxPQUFPQyxJQUFJLENBQUNDLFNBQVMsQ0FBQ3JFLEtBQUssQ0FBQztJQUFFO0lBQ2hDLEtBQUssUUFBUTtNQUNYLElBQUdBLEtBQUssS0FBSyxJQUFJLEVBQUU7UUFDakIsT0FBTyxNQUFNO01BQ2YsQ0FBQyxNQUFNLElBQUdxQixLQUFLLENBQUNGLE9BQU8sQ0FBQ25CLEtBQUssQ0FBQyxFQUFFO1FBQzlCLE9BQU8sU0FBUyxHQUFHOEQsZUFBZSxDQUFDOUQsS0FBSyxFQUFFNEQsU0FBUyxDQUFDLEdBQUcsR0FBRztNQUM1RCxDQUFDLE1BQU0sSUFBR25DLE1BQU0sQ0FBQ0MsUUFBUSxJQUFJMUIsS0FBSyxFQUFFO1FBQUU7UUFDcEMsT0FBT0EsS0FBSyxDQUFDc0UsV0FBVyxDQUFDQyxJQUFJLEdBQ3pCLElBQUksR0FBR1QsZUFBZSxDQUFDekMsS0FBSyxDQUFDa0MsSUFBSSxDQUFDdkQsS0FBSyxDQUFDLEVBQUU0RCxTQUFTLENBQUMsR0FDcEQsR0FBRyxDQUFDLENBQUM7TUFDWCxDQUFDLE1BQU07UUFBRTtRQUNQLE9BQU81RCxLQUFLLENBQUNzRSxXQUFXLENBQUNDLElBQUksR0FBRyxHQUFHLEdBQzVCYixRQUFRLENBQUNVLElBQUksQ0FBQ0MsU0FBUyxDQUFDckUsS0FBSyxDQUFDLEVBQUU0RCxTQUFTLENBQUM7TUFDbkQ7SUFDRjtNQUNFLE9BQU8zRCxJQUFJLEdBQUcsSUFBSSxHQUFHRCxLQUFLLENBQUNtRSxRQUFRLEVBQUU7RUFBQztBQUU1QztBQUVBLFNBQVNLLGdCQUFnQixDQUFDQyxRQUFRLEVBQUU7RUFDbEMsSUFBSTtJQUNGLE9BQU8sT0FBTyxHQUFHUCxVQUFVLENBQUNPLFFBQVEsQ0FBQztFQUN2QyxDQUFDLENBQUMsT0FBTUMsQ0FBQyxFQUFFO0lBQ1QsT0FBTyxFQUFFO0VBQ1g7QUFDRjtBQUVBLE1BQU1sQixnQkFBZ0IsR0FBRyxVQUFVaUIsUUFBUSxFQUFFO0VBQzNDLE9BQU8sSUFBSUUsS0FBSyxDQUFDLG1DQUFtQyxHQUNuQyw4Q0FBOEMsR0FDOUNILGdCQUFnQixDQUFDQyxRQUFRLENBQUMsQ0FBQztBQUM5QyxDQUFDO0FBRUQsTUFBTUcsVUFBVSxHQUFJQyxJQUFJLElBQUs7RUFDM0IsT0FBTyxPQUFPQSxJQUFJLEtBQUssVUFBVTtBQUNuQyxDQUFDO0FBRUQsTUFBTTFCLGFBQWEsR0FBRyxVQUFVMkIsTUFBTSxFQUFFO0VBQ3RDLE9BQU9BLE1BQU0sSUFBSS9FLFFBQVEsQ0FBQytFLE1BQU0sQ0FBQyxJQUMvQkYsVUFBVSxDQUFDRSxNQUFNLENBQUMvQyxPQUFPLENBQUMsSUFBSTZDLFVBQVUsQ0FBQ0UsTUFBTSxDQUFDbkMsS0FBSyxDQUFDO0FBQzFELENBQUM7O0FBRUQ7QUFDQTtBQUNBO0FBQ0EsTUFBTWMsU0FBUyxHQUFHLFVBQVVyQixZQUFZLEVBQUVNLFFBQVEsRUFBRVQsU0FBUyxFQUFFO0VBQzdELElBQUk4QyxNQUFNLEdBQUdDLE9BQU8sQ0FBQyxlQUFlLENBQUMsQ0FBQ0MsWUFBWSxDQUFDQyx1QkFBdUI7RUFDMUUsSUFBSUMsWUFBWSxHQUFHLEVBQUU7RUFDckIsSUFBSUMsWUFBWSxHQUFHLEVBQUU7RUFDckIsSUFBSUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7RUFDakIsSUFBSUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7RUFDakIsSUFBSUMsTUFBTSxHQUFHLENBQUMsQ0FBQztFQUNmLElBQUlDLFNBQVMsR0FBR3BELFlBQVksQ0FBQzdCLE1BQU07RUFFbkNtQyxRQUFRLENBQUMrQyxPQUFPLENBQUMsVUFBVTVDLEdBQUcsRUFBRW9CLENBQUMsRUFBRTtJQUNqQ21CLFlBQVksQ0FBQ00sSUFBSSxDQUFDO01BQUM1QyxHQUFHLEVBQUVELEdBQUcsQ0FBQ0M7SUFBRyxDQUFDLENBQUM7SUFDakN3QyxNQUFNLENBQUMxRCxXQUFXLENBQUNpQixHQUFHLENBQUNDLEdBQUcsQ0FBQyxDQUFDLEdBQUdtQixDQUFDO0VBQ2xDLENBQUMsQ0FBQztFQUNGN0IsWUFBWSxDQUFDcUQsT0FBTyxDQUFDLFVBQVU1QyxHQUFHLEVBQUVvQixDQUFDLEVBQUU7SUFDckNrQixZQUFZLENBQUNPLElBQUksQ0FBQztNQUFDNUMsR0FBRyxFQUFFRCxHQUFHLENBQUNDO0lBQUcsQ0FBQyxDQUFDO0lBQ2pDdUMsTUFBTSxDQUFDekQsV0FBVyxDQUFDaUIsR0FBRyxDQUFDQyxHQUFHLENBQUMsQ0FBQyxHQUFHbUIsQ0FBQztJQUNoQ3NCLE1BQU0sQ0FBQzNELFdBQVcsQ0FBQ2lCLEdBQUcsQ0FBQ0MsR0FBRyxDQUFDLENBQUMsR0FBR21CLENBQUM7RUFDbEMsQ0FBQyxDQUFDOztFQUVGO0VBQ0E7RUFDQTtFQUNBO0VBQ0FjLE1BQU0sQ0FBQ0ksWUFBWSxFQUFFQyxZQUFZLEVBQUU7SUFDakNPLFdBQVcsRUFBRSxVQUFVQyxFQUFFLEVBQUUvQyxHQUFHLEVBQUVnRCxNQUFNLEVBQUU7TUFDdEMsSUFBSUMsUUFBUSxHQUFHRCxNQUFNLEdBQUdOLE1BQU0sQ0FBQzNELFdBQVcsQ0FBQ2lFLE1BQU0sQ0FBQyxDQUFDLEdBQUdMLFNBQVM7TUFFL0QsSUFBSUssTUFBTSxFQUFFO1FBQ1Y7UUFDQTtRQUNBbEUsTUFBTSxDQUFDb0UsT0FBTyxDQUFDUixNQUFNLENBQUMsQ0FBQ0UsT0FBTyxDQUFDLGdCQUFxQjtVQUFBLElBQVgsQ0FBQ0csRUFBRSxFQUFFSSxHQUFHLENBQUM7VUFDaEQsSUFBSUEsR0FBRyxJQUFJRixRQUFRLEVBQ2pCUCxNQUFNLENBQUNLLEVBQUUsQ0FBQyxFQUFFO1FBQ2hCLENBQUMsQ0FBQztNQUNKO01BRUFKLFNBQVMsRUFBRTtNQUNYRCxNQUFNLENBQUMzRCxXQUFXLENBQUNnRSxFQUFFLENBQUMsQ0FBQyxHQUFHRSxRQUFRO01BRWxDN0QsU0FBUyxDQUFDZ0UsT0FBTyxDQUNmTCxFQUFFLEVBQ0ZsRCxRQUFRLENBQUM0QyxNQUFNLENBQUMxRCxXQUFXLENBQUNnRSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM3QyxJQUFJLEVBQ3RDK0MsUUFBUSxFQUNSRCxNQUFNLENBQUM7SUFDWCxDQUFDO0lBQ0RLLFdBQVcsRUFBRSxVQUFVTixFQUFFLEVBQUVDLE1BQU0sRUFBRTtNQUNqQyxJQUFJRCxFQUFFLEtBQUtDLE1BQU0sRUFDZjtNQUVGLElBQUlNLFdBQVcsR0FBR1osTUFBTSxDQUFDM0QsV0FBVyxDQUFDZ0UsRUFBRSxDQUFDLENBQUM7TUFDekMsSUFBSVEsV0FBVyxHQUFHUCxNQUFNLEdBQUdOLE1BQU0sQ0FBQzNELFdBQVcsQ0FBQ2lFLE1BQU0sQ0FBQyxDQUFDLEdBQUdMLFNBQVM7O01BRWxFO01BQ0E7TUFDQTtNQUNBO01BQ0E7TUFDQTtNQUNBO01BQ0E7TUFDQSxJQUFJWSxXQUFXLEdBQUdELFdBQVcsRUFBRTtRQUM3QkMsV0FBVyxFQUFFO01BQ2Y7O01BRUE7TUFDQTtNQUNBO01BQ0E7TUFDQTtNQUNBO01BQ0E7TUFDQTtNQUNBO01BQ0F6RSxNQUFNLENBQUNvRSxPQUFPLENBQUNSLE1BQU0sQ0FBQyxDQUFDRSxPQUFPLENBQUMsaUJBQStCO1FBQUEsSUFBckIsQ0FBQ0csRUFBRSxFQUFFUyxhQUFhLENBQUM7UUFDMUQsSUFBSUYsV0FBVyxHQUFHRSxhQUFhLElBQUlBLGFBQWEsR0FBR0QsV0FBVyxFQUM1RGIsTUFBTSxDQUFDSyxFQUFFLENBQUMsRUFBRSxDQUFDLEtBQ1YsSUFBSVEsV0FBVyxJQUFJQyxhQUFhLElBQUlBLGFBQWEsR0FBR0YsV0FBVyxFQUNsRVosTUFBTSxDQUFDSyxFQUFFLENBQUMsRUFBRTtNQUNoQixDQUFDLENBQUM7O01BRUY7TUFDQUwsTUFBTSxDQUFDM0QsV0FBVyxDQUFDZ0UsRUFBRSxDQUFDLENBQUMsR0FBR1EsV0FBVztNQUVyQ25FLFNBQVMsQ0FBQ3FFLE9BQU8sQ0FDZlYsRUFBRSxFQUNGbEQsUUFBUSxDQUFDNEMsTUFBTSxDQUFDMUQsV0FBVyxDQUFDZ0UsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDN0MsSUFBSSxFQUN0Q29ELFdBQVcsRUFDWEMsV0FBVyxFQUNYUCxNQUFNLENBQUM7SUFDWCxDQUFDO0lBQ0RVLE9BQU8sRUFBRSxVQUFVWCxFQUFFLEVBQUU7TUFDckIsSUFBSVksWUFBWSxHQUFHakIsTUFBTSxDQUFDM0QsV0FBVyxDQUFDZ0UsRUFBRSxDQUFDLENBQUM7TUFFMUNqRSxNQUFNLENBQUNvRSxPQUFPLENBQUNSLE1BQU0sQ0FBQyxDQUFDRSxPQUFPLENBQUMsaUJBQXFCO1FBQUEsSUFBWCxDQUFDRyxFQUFFLEVBQUVJLEdBQUcsQ0FBQztRQUNoRCxJQUFJQSxHQUFHLElBQUlRLFlBQVksRUFDckJqQixNQUFNLENBQUNLLEVBQUUsQ0FBQyxFQUFFO01BQ2hCLENBQUMsQ0FBQztNQUVGLE9BQU9MLE1BQU0sQ0FBQzNELFdBQVcsQ0FBQ2dFLEVBQUUsQ0FBQyxDQUFDO01BQzlCSixTQUFTLEVBQUU7TUFFWHZELFNBQVMsQ0FBQ3dFLFNBQVMsQ0FDakJiLEVBQUUsRUFDRnhELFlBQVksQ0FBQ2lELE1BQU0sQ0FBQ3pELFdBQVcsQ0FBQ2dFLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQzdDLElBQUksRUFDMUN5RCxZQUFZLENBQUM7SUFDakI7RUFDRixDQUFDLENBQUM7RUFFRjdFLE1BQU0sQ0FBQ29FLE9BQU8sQ0FBQ1QsTUFBTSxDQUFDLENBQUNHLE9BQU8sQ0FBQyxpQkFBMkI7SUFBQSxJQUFqQixDQUFDaUIsUUFBUSxFQUFFVixHQUFHLENBQUM7SUFFdEQsSUFBSUosRUFBRSxHQUFHOUQsT0FBTyxDQUFDNEUsUUFBUSxDQUFDO0lBRTFCLElBQUl4RyxHQUFHLENBQUNtRixNQUFNLEVBQUVxQixRQUFRLENBQUMsRUFBRTtNQUN6QjtNQUNBO01BQ0E7TUFDQTtNQUNBO01BQ0E7TUFDQTtNQUNBLElBQUlDLE9BQU8sR0FBR2pFLFFBQVEsQ0FBQ3NELEdBQUcsQ0FBQyxDQUFDakQsSUFBSTtNQUNoQyxJQUFJNkQsT0FBTyxHQUFHeEUsWUFBWSxDQUFDaUQsTUFBTSxDQUFDcUIsUUFBUSxDQUFDLENBQUMsQ0FBQzNELElBQUk7TUFFakQsSUFBSSxPQUFPNEQsT0FBTyxLQUFLLFFBQVEsSUFBSUEsT0FBTyxLQUFLQyxPQUFPLEVBQ2xEM0UsU0FBUyxDQUFDNEUsU0FBUyxDQUFDakIsRUFBRSxFQUFFZSxPQUFPLEVBQUVDLE9BQU8sRUFBRVosR0FBRyxDQUFDO0lBQ2xEO0VBQ0osQ0FBQyxDQUFDO0FBQ0osQ0FBQztBQUVEL0MsaUJBQWlCLEdBQUcsVUFBVWIsWUFBWSxFQUFFSCxTQUFTLEVBQUU7RUFDckQsT0FBTyxFQUFFO0FBQ1gsQ0FBQztBQUVEaUIsaUJBQWlCLEdBQUcsVUFBVWQsWUFBWSxFQUFFa0IsS0FBSyxFQUFFckIsU0FBUyxFQUFFO0VBQzVELElBQUk2RSxPQUFPLEdBQUcsQ0FBQyxDQUFDO0VBQ2hCLElBQUlwRSxRQUFRLEdBQUdZLEtBQUssQ0FBQ1YsR0FBRyxDQUFDLFVBQVVHLElBQUksRUFBRWdFLEtBQUssRUFBRTtJQUM5QyxJQUFJbkIsRUFBRTtJQUNOLElBQUksT0FBTzdDLElBQUksS0FBSyxRQUFRLEVBQUU7TUFDNUI7TUFDQTZDLEVBQUUsR0FBRyxHQUFHLEdBQUc3QyxJQUFJO0lBQ2pCLENBQUMsTUFBTSxJQUFJLE9BQU9BLElBQUksS0FBSyxRQUFRLElBQ3hCLE9BQU9BLElBQUksS0FBSyxTQUFTLElBQ3pCQSxJQUFJLEtBQUtpRSxTQUFTLElBQ2xCakUsSUFBSSxLQUFLLElBQUksRUFBRTtNQUN4QjZDLEVBQUUsR0FBRzdDLElBQUk7SUFDWCxDQUFDLE1BQU0sSUFBSSxPQUFPQSxJQUFJLEtBQUssUUFBUSxFQUFFO01BQ25DNkMsRUFBRSxHQUFJN0MsSUFBSSxJQUFLLEtBQUssSUFBSUEsSUFBSyxHQUFJQSxJQUFJLENBQUNELEdBQUcsR0FBR2lFLEtBQUs7SUFDbkQsQ0FBQyxNQUFNO01BQ0wsTUFBTSxJQUFJcEMsS0FBSyxDQUFDLHdDQUF3QyxHQUN4QyxtQkFBbUIsR0FBRyxPQUFPNUIsSUFBSSxDQUFDO0lBQ3BEO0lBRUEsSUFBSTJELFFBQVEsR0FBRzlFLFdBQVcsQ0FBQ2dFLEVBQUUsQ0FBQztJQUM5QixJQUFJa0IsT0FBTyxDQUFDSixRQUFRLENBQUMsRUFBRTtNQUNyQixJQUFJM0QsSUFBSSxJQUFJLE9BQU9BLElBQUksS0FBSyxRQUFRLElBQUksS0FBSyxJQUFJQSxJQUFJLEVBQ25EbkMsSUFBSSxDQUFDLGVBQWUsR0FBR2dGLEVBQUUsR0FBRyxLQUFLLEVBQUV0QyxLQUFLLENBQUM7TUFDM0NzQyxFQUFFLEdBQUdxQixNQUFNLENBQUNyQixFQUFFLEVBQUU7SUFDbEIsQ0FBQyxNQUFNO01BQ0xrQixPQUFPLENBQUNKLFFBQVEsQ0FBQyxHQUFHLElBQUk7SUFDMUI7SUFFQSxPQUFPO01BQUU1RCxHQUFHLEVBQUU4QyxFQUFFO01BQUU3QyxJQUFJLEVBQUVBO0lBQUssQ0FBQztFQUNoQyxDQUFDLENBQUM7RUFFRixPQUFPTCxRQUFRO0FBQ2pCLENBQUM7QUFFRFcsa0JBQWtCLEdBQUcsVUFBVWpCLFlBQVksRUFBRTBDLE1BQU0sRUFBRTdDLFNBQVMsRUFBRTtFQUM5RCxJQUFJaUYsT0FBTyxHQUFHLElBQUksQ0FBQyxDQUFDO0VBQ3BCLElBQUl4RSxRQUFRLEdBQUcsRUFBRTtFQUVqQixJQUFJeUUsYUFBYSxHQUFHckMsTUFBTSxDQUFDL0MsT0FBTyxDQUFDO0lBQ2pDa0UsT0FBTyxFQUFFLFVBQVVtQixRQUFRLEVBQUVDLE9BQU8sRUFBRXhCLE1BQU0sRUFBRTtNQUM1QyxJQUFJcUIsT0FBTyxFQUFFO1FBQ1g7UUFDQTtRQUNBLElBQUlyQixNQUFNLEtBQUssSUFBSSxFQUNqQixNQUFNLElBQUlsQixLQUFLLENBQUMsNkNBQTZDLENBQUM7UUFDaEVqQyxRQUFRLENBQUNnRCxJQUFJLENBQUM7VUFBRTVDLEdBQUcsRUFBRXNFLFFBQVEsQ0FBQ3RFLEdBQUc7VUFBRUMsSUFBSSxFQUFFcUU7UUFBUyxDQUFDLENBQUM7TUFDdEQsQ0FBQyxNQUFNO1FBQ0xuRixTQUFTLENBQUNnRSxPQUFPLENBQUNtQixRQUFRLENBQUN0RSxHQUFHLEVBQUVzRSxRQUFRLEVBQUVDLE9BQU8sRUFBRXhCLE1BQU0sQ0FBQztNQUM1RDtJQUNGLENBQUM7SUFDRGdCLFNBQVMsRUFBRSxVQUFVUyxXQUFXLEVBQUVDLFdBQVcsRUFBRUYsT0FBTyxFQUFFO01BQ3REcEYsU0FBUyxDQUFDNEUsU0FBUyxDQUFDUyxXQUFXLENBQUN4RSxHQUFHLEVBQUV3RSxXQUFXLEVBQUVDLFdBQVcsRUFDekNGLE9BQU8sQ0FBQztJQUM5QixDQUFDO0lBQ0RaLFNBQVMsRUFBRSxVQUFVYyxXQUFXLEVBQUVGLE9BQU8sRUFBRTtNQUN6Q3BGLFNBQVMsQ0FBQ3dFLFNBQVMsQ0FBQ2MsV0FBVyxDQUFDekUsR0FBRyxFQUFFeUUsV0FBVyxFQUFFRixPQUFPLENBQUM7SUFDNUQsQ0FBQztJQUNEZixPQUFPLEVBQUUsVUFBVWMsUUFBUSxFQUFFSSxTQUFTLEVBQUVDLE9BQU8sRUFBRTVCLE1BQU0sRUFBRTtNQUN2RDVELFNBQVMsQ0FBQ3FFLE9BQU8sQ0FDZmMsUUFBUSxDQUFDdEUsR0FBRyxFQUFFc0UsUUFBUSxFQUFFSSxTQUFTLEVBQUVDLE9BQU8sRUFBRTVCLE1BQU0sQ0FBQztJQUN2RDtFQUNGLENBQUMsQ0FBQztFQUNGcUIsT0FBTyxHQUFHLEtBQUs7RUFFZixPQUFPLENBQUN4RSxRQUFRLEVBQUV5RSxhQUFhLENBQUM7QUFDbEMsQ0FBQyxDIiwiZmlsZSI6Ii9wYWNrYWdlcy9vYnNlcnZlLXNlcXVlbmNlLmpzIiwic291cmNlc0NvbnRlbnQiOlsiY29uc3QgaXNPYmplY3QgPSBmdW5jdGlvbiAodmFsdWUpIHtcbiAgdmFyIHR5cGUgPSB0eXBlb2YgdmFsdWU7XG4gIHJldHVybiB2YWx1ZSAhPSBudWxsICYmICh0eXBlID09ICdvYmplY3QnIHx8IHR5cGUgPT0gJ2Z1bmN0aW9uJyk7XG59XG5jb25zdCBoYXMgPSBmdW5jdGlvbiAob2JqLCBrZXkpIHtcbiAgdmFyIGtleVBhcnRzID0ga2V5LnNwbGl0KCcuJyk7XG5cbiAgcmV0dXJuICEhb2JqICYmIChcbiAgICBrZXlQYXJ0cy5sZW5ndGggPiAxXG4gICAgICA/IGhhcyhvYmpba2V5LnNwbGl0KCcuJylbMF1dLCBrZXlQYXJ0cy5zbGljZSgxKS5qb2luKCcuJykpXG4gICAgICA6IGhhc093blByb3BlcnR5LmNhbGwob2JqLCBrZXkpXG4gICk7XG59O1xuXG5jb25zdCB3YXJuID0gZnVuY3Rpb24gKCkge1xuICBpZiAoT2JzZXJ2ZVNlcXVlbmNlLl9zdXBwcmVzc1dhcm5pbmdzKSB7XG4gICAgT2JzZXJ2ZVNlcXVlbmNlLl9zdXBwcmVzc1dhcm5pbmdzLS07XG4gIH0gZWxzZSB7XG4gICAgaWYgKHR5cGVvZiBjb25zb2xlICE9PSAndW5kZWZpbmVkJyAmJiBjb25zb2xlLndhcm4pXG4gICAgICBjb25zb2xlLndhcm4uYXBwbHkoY29uc29sZSwgYXJndW1lbnRzKTtcblxuICAgIE9ic2VydmVTZXF1ZW5jZS5fbG9nZ2VkV2FybmluZ3MrKztcbiAgfVxufTtcblxuLy8gaXNBcnJheSByZXR1cm5zIHRydWUgZm9yIGFycmF5cyBvZiB0aGVzZSB0eXBlczpcbi8vIHN0YW5kYXJkIGFycmF5czogaW5zdGFuY2VvZiBBcnJheSA9PT0gdHJ1ZSwgXy5pc0FycmF5KGFycikgPT09IHRydWVcbi8vIHZtIGdlbmVyYXRlZCBhcnJheXM6IGluc3RhbmNlT2YgQXJyYXkgPT09IGZhbHNlLCBfLmlzQXJyYXkoYXJyKSA9PT0gdHJ1ZVxuLy8gc3ViY2xhc3NlZCBhcnJheXM6IGluc3RhbmNlb2YgQXJyYXkgPT09IHRydWUsIF8uaXNBcnJheShhcnIpID09PSBmYWxzZVxuLy8gc2VlIHNwZWNpZmljIHRlc3RzXG5mdW5jdGlvbiBpc0FycmF5KGFycikge1xuICByZXR1cm4gYXJyIGluc3RhbmNlb2YgQXJyYXkgfHwgQXJyYXkuaXNBcnJheShhcnIpO1xufVxuXG4vLyBpc0l0ZXJhYmxlIHJldHVybnMgdHJ1ZXMgZm9yIG9iamVjdHMgaW1wbGVtZW50aW5nIGl0ZXJhYmxlIHByb3RvY29sLFxuLy8gZXhjZXB0IHN0cmluZ3MsIGFzIHt7I2VhY2ggJ3N0cmluZyd9fSBkb2Vzbid0IG1ha2UgbXVjaCBzZW5zZS5cbi8vIFJlcXVpcmVzIEVTNisgYW5kIGRvZXMgbm90IHdvcmsgaW4gSUUgKGJ1dCBkZWdyYWRlcyBncmFjZWZ1bGx5KS5cbi8vIERvZXMgbm90IHN1cHBvcnQgdGhlIGBsZW5ndGhgICsgaW5kZXggcHJvdG9jb2wgYWxzbyBzdXBwb3J0ZWQgYnkgQXJyYXkuZnJvbVxuZnVuY3Rpb24gaXNJdGVyYWJsZSAob2JqZWN0KSB7XG4gIGNvbnN0IGl0ZXIgPSB0eXBlb2YgU3ltYm9sICE9ICd1bmRlZmluZWQnICYmIFN5bWJvbC5pdGVyYXRvcjtcbiAgcmV0dXJuIGl0ZXJcbiAgICAmJiBvYmplY3QgaW5zdGFuY2VvZiBPYmplY3QgLy8gbm90ZTogcmV0dXJucyBmYWxzZSBmb3Igc3RyaW5nc1xuICAgICYmIHR5cGVvZiBvYmplY3RbaXRlcl0gPT0gJ2Z1bmN0aW9uJzsgLy8gaW1wbGVtZW50cyBpdGVyYWJsZSBwcm90b2NvbFxufVxuXG5jb25zdCBpZFN0cmluZ2lmeSA9IE1vbmdvSUQuaWRTdHJpbmdpZnk7XG5jb25zdCBpZFBhcnNlID0gTW9uZ29JRC5pZFBhcnNlO1xuXG5PYnNlcnZlU2VxdWVuY2UgPSB7XG4gIF9zdXBwcmVzc1dhcm5pbmdzOiAwLFxuICBfbG9nZ2VkV2FybmluZ3M6IDAsXG5cbiAgLy8gQSBtZWNoYW5pc20gc2ltaWxhciB0byBjdXJzb3Iub2JzZXJ2ZSB3aGljaCByZWNlaXZlcyBhIHJlYWN0aXZlXG4gIC8vIGZ1bmN0aW9uIHJldHVybmluZyBhIHNlcXVlbmNlIHR5cGUgYW5kIGZpcmluZyBhcHByb3ByaWF0ZSBjYWxsYmFja3NcbiAgLy8gd2hlbiB0aGUgdmFsdWUgY2hhbmdlcy5cbiAgLy9cbiAgLy8gQHBhcmFtIHNlcXVlbmNlRnVuYyB7RnVuY3Rpb259IGEgcmVhY3RpdmUgZnVuY3Rpb24gcmV0dXJuaW5nIGFcbiAgLy8gICAgIHNlcXVlbmNlIHR5cGUuIFRoZSBjdXJyZW50bHkgc3VwcG9ydGVkIHNlcXVlbmNlIHR5cGVzIGFyZTpcbiAgLy8gICAgIEFycmF5LCBDdXJzb3IsIGFuZCBudWxsLlxuICAvL1xuICAvLyBAcGFyYW0gY2FsbGJhY2tzIHtPYmplY3R9IHNpbWlsYXIgdG8gYSBzcGVjaWZpYyBzdWJzZXQgb2ZcbiAgLy8gICAgIGNhbGxiYWNrcyBwYXNzZWQgdG8gYGN1cnNvci5vYnNlcnZlYFxuICAvLyAgICAgKGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI29ic2VydmUpLCB3aXRoIG1pbm9yIHZhcmlhdGlvbnMgdG9cbiAgLy8gICAgIHN1cHBvcnQgdGhlIGZhY3QgdGhhdCBub3QgYWxsIHNlcXVlbmNlcyBjb250YWluIG9iamVjdHMgd2l0aFxuICAvLyAgICAgX2lkIGZpZWxkcy4gIFNwZWNpZmljYWxseTpcbiAgLy9cbiAgLy8gICAgICogYWRkZWRBdChpZCwgaXRlbSwgYXRJbmRleCwgYmVmb3JlSWQpXG4gIC8vICAgICAqIGNoYW5nZWRBdChpZCwgbmV3SXRlbSwgb2xkSXRlbSwgYXRJbmRleClcbiAgLy8gICAgICogcmVtb3ZlZEF0KGlkLCBvbGRJdGVtLCBhdEluZGV4KVxuICAvLyAgICAgKiBtb3ZlZFRvKGlkLCBpdGVtLCBmcm9tSW5kZXgsIHRvSW5kZXgsIGJlZm9yZUlkKVxuICAvL1xuICAvLyBAcmV0dXJucyB7T2JqZWN0KHN0b3A6IEZ1bmN0aW9uKX0gY2FsbCAnc3RvcCcgb24gdGhlIHJldHVybiB2YWx1ZVxuICAvLyAgICAgdG8gc3RvcCBvYnNlcnZpbmcgdGhpcyBzZXF1ZW5jZSBmdW5jdGlvbi5cbiAgLy9cbiAgLy8gV2UgZG9uJ3QgbWFrZSBhbnkgYXNzdW1wdGlvbnMgYWJvdXQgb3VyIGFiaWxpdHkgdG8gY29tcGFyZSBzZXF1ZW5jZVxuICAvLyBlbGVtZW50cyAoaWUsIHdlIGRvbid0IGFzc3VtZSBFSlNPTi5lcXVhbHMgd29ya3M7IG1heWJlIHRoZXJlIGlzIGV4dHJhXG4gIC8vIHN0YXRlL3JhbmRvbSBtZXRob2RzIG9uIHRoZSBvYmplY3RzKSBzbyB1bmxpa2UgY3Vyc29yLm9ic2VydmUsIHdlIG1heVxuICAvLyBzb21ldGltZXMgY2FsbCBjaGFuZ2VkQXQoKSB3aGVuIG5vdGhpbmcgYWN0dWFsbHkgY2hhbmdlZC5cbiAgLy8gWFhYIGNvbnNpZGVyIGlmIHdlICpjYW4qIG1ha2UgdGhlIHN0cm9uZ2VyIGFzc3VtcHRpb24gYW5kIGF2b2lkXG4gIC8vICAgICBuby1vcCBjaGFuZ2VkQXQgY2FsbHMgKGluIHNvbWUgY2FzZXM/KVxuICAvL1xuICAvLyBYWFggY3VycmVudGx5IG9ubHkgc3VwcG9ydHMgdGhlIGNhbGxiYWNrcyB1c2VkIGJ5IG91clxuICAvLyBpbXBsZW1lbnRhdGlvbiBvZiB7eyNlYWNofX0sIGJ1dCB0aGlzIGNhbiBiZSBleHBhbmRlZC5cbiAgLy9cbiAgLy8gWFhYICNlYWNoIGRvZXNuJ3QgdXNlIHRoZSBpbmRpY2VzICh0aG91Z2ggd2UnbGwgZXZlbnR1YWxseSBuZWVkXG4gIC8vIGEgd2F5IHRvIGdldCB0aGVtIHdoZW4gd2Ugc3VwcG9ydCBgQGluZGV4YCksIGJ1dCBjYWxsaW5nXG4gIC8vIGBjdXJzb3Iub2JzZXJ2ZWAgY2F1c2VzIHRoZSBpbmRleCB0byBiZSBjYWxjdWxhdGVkIG9uIGV2ZXJ5XG4gIC8vIGNhbGxiYWNrIHVzaW5nIGEgbGluZWFyIHNjYW4gKHVubGVzcyB5b3UgdHVybiBpdCBvZmYgYnkgcGFzc2luZ1xuICAvLyBgX25vX2luZGljZXNgKS4gIEFueSB3YXkgdG8gYXZvaWQgY2FsY3VsYXRpbmcgaW5kaWNlcyBvbiBhIHB1cmVcbiAgLy8gY3Vyc29yIG9ic2VydmUgbGlrZSB3ZSB1c2VkIHRvP1xuICBvYnNlcnZlOiBmdW5jdGlvbiAoc2VxdWVuY2VGdW5jLCBjYWxsYmFja3MpIHtcbiAgICB2YXIgbGFzdFNlcSA9IG51bGw7XG4gICAgdmFyIGFjdGl2ZU9ic2VydmVIYW5kbGUgPSBudWxsO1xuXG4gICAgLy8gJ2xhc3RTZXFBcnJheScgY29udGFpbnMgdGhlIHByZXZpb3VzIHZhbHVlIG9mIHRoZSBzZXF1ZW5jZVxuICAgIC8vIHdlJ3JlIG9ic2VydmluZy4gSXQgaXMgYW4gYXJyYXkgb2Ygb2JqZWN0cyB3aXRoICdfaWQnIGFuZFxuICAgIC8vICdpdGVtJyBmaWVsZHMuICAnaXRlbScgaXMgdGhlIGVsZW1lbnQgaW4gdGhlIGFycmF5LCBvciB0aGVcbiAgICAvLyBkb2N1bWVudCBpbiB0aGUgY3Vyc29yLlxuICAgIC8vXG4gICAgLy8gJ19pZCcgaXMgd2hpY2hldmVyIG9mIHRoZSBmb2xsb3dpbmcgaXMgcmVsZXZhbnQsIHVubGVzcyBpdCBoYXNcbiAgICAvLyBhbHJlYWR5IGFwcGVhcmVkIC0tIGluIHdoaWNoIGNhc2UgaXQncyByYW5kb21seSBnZW5lcmF0ZWQuXG4gICAgLy9cbiAgICAvLyAqIGlmICdpdGVtJyBpcyBhbiBvYmplY3Q6XG4gICAgLy8gICAqIGFuICdfaWQnIGZpZWxkLCBpZiBwcmVzZW50XG4gICAgLy8gICAqIG90aGVyd2lzZSwgdGhlIGluZGV4IGluIHRoZSBhcnJheVxuICAgIC8vXG4gICAgLy8gKiBpZiAnaXRlbScgaXMgYSBudW1iZXIgb3Igc3RyaW5nLCB1c2UgdGhhdCB2YWx1ZVxuICAgIC8vXG4gICAgLy8gWFhYIHRoaXMgY2FuIGJlIGdlbmVyYWxpemVkIGJ5IGFsbG93aW5nIHt7I2VhY2h9fSB0byBhY2NlcHQgYVxuICAgIC8vIGdlbmVyYWwgJ2tleScgYXJndW1lbnQgd2hpY2ggY291bGQgYmUgYSBmdW5jdGlvbiwgYSBkb3R0ZWRcbiAgICAvLyBmaWVsZCBuYW1lLCBvciB0aGUgc3BlY2lhbCBAaW5kZXggdmFsdWUuXG4gICAgdmFyIGxhc3RTZXFBcnJheSA9IFtdOyAvLyBlbGVtZW50cyBhcmUgb2JqZWN0cyBvZiBmb3JtIHtfaWQsIGl0ZW19XG4gICAgdmFyIGNvbXB1dGF0aW9uID0gVHJhY2tlci5hdXRvcnVuKGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhciBzZXEgPSBzZXF1ZW5jZUZ1bmMoKTtcblxuICAgICAgVHJhY2tlci5ub25yZWFjdGl2ZShmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBzZXFBcnJheTsgLy8gc2FtZSBzdHJ1Y3R1cmUgYXMgYGxhc3RTZXFBcnJheWAgYWJvdmUuXG5cbiAgICAgICAgaWYgKGFjdGl2ZU9ic2VydmVIYW5kbGUpIHtcbiAgICAgICAgICAvLyBJZiB3ZSB3ZXJlIHByZXZpb3VzbHkgb2JzZXJ2aW5nIGEgY3Vyc29yLCByZXBsYWNlIGxhc3RTZXFBcnJheSB3aXRoXG4gICAgICAgICAgLy8gbW9yZSB1cC10by1kYXRlIGluZm9ybWF0aW9uLiAgVGhlbiBzdG9wIHRoZSBvbGQgb2JzZXJ2ZS5cbiAgICAgICAgICBsYXN0U2VxQXJyYXkgPSBsYXN0U2VxLmZldGNoKCkubWFwKGZ1bmN0aW9uIChkb2MpIHtcbiAgICAgICAgICAgIHJldHVybiB7X2lkOiBkb2MuX2lkLCBpdGVtOiBkb2N9O1xuICAgICAgICAgIH0pO1xuICAgICAgICAgIGFjdGl2ZU9ic2VydmVIYW5kbGUuc3RvcCgpO1xuICAgICAgICAgIGFjdGl2ZU9ic2VydmVIYW5kbGUgPSBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCFzZXEpIHtcbiAgICAgICAgICBzZXFBcnJheSA9IHNlcUNoYW5nZWRUb0VtcHR5KGxhc3RTZXFBcnJheSwgY2FsbGJhY2tzKTtcbiAgICAgICAgfSBlbHNlIGlmIChpc0FycmF5KHNlcSkpIHtcbiAgICAgICAgICBzZXFBcnJheSA9IHNlcUNoYW5nZWRUb0FycmF5KGxhc3RTZXFBcnJheSwgc2VxLCBjYWxsYmFja3MpO1xuICAgICAgICB9IGVsc2UgaWYgKGlzU3RvcmVDdXJzb3Ioc2VxKSkge1xuICAgICAgICAgIHZhciByZXN1bHQgLyogW3NlcUFycmF5LCBhY3RpdmVPYnNlcnZlSGFuZGxlXSAqLyA9XG4gICAgICAgICAgICAgICAgc2VxQ2hhbmdlZFRvQ3Vyc29yKGxhc3RTZXFBcnJheSwgc2VxLCBjYWxsYmFja3MpO1xuICAgICAgICAgIHNlcUFycmF5ID0gcmVzdWx0WzBdO1xuICAgICAgICAgIGFjdGl2ZU9ic2VydmVIYW5kbGUgPSByZXN1bHRbMV07XG4gICAgICAgIH0gZWxzZSBpZiAoaXNJdGVyYWJsZShzZXEpKSB7XG4gICAgICAgICAgY29uc3QgYXJyYXkgPSBBcnJheS5mcm9tKHNlcSk7XG4gICAgICAgICAgc2VxQXJyYXkgPSBzZXFDaGFuZ2VkVG9BcnJheShsYXN0U2VxQXJyYXksIGFycmF5LCBjYWxsYmFja3MpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRocm93IGJhZFNlcXVlbmNlRXJyb3Ioc2VxKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGRpZmZBcnJheShsYXN0U2VxQXJyYXksIHNlcUFycmF5LCBjYWxsYmFja3MpO1xuICAgICAgICBsYXN0U2VxID0gc2VxO1xuICAgICAgICBsYXN0U2VxQXJyYXkgPSBzZXFBcnJheTtcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHN0b3A6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgY29tcHV0YXRpb24uc3RvcCgpO1xuICAgICAgICBpZiAoYWN0aXZlT2JzZXJ2ZUhhbmRsZSlcbiAgICAgICAgICBhY3RpdmVPYnNlcnZlSGFuZGxlLnN0b3AoKTtcbiAgICAgIH1cbiAgICB9O1xuICB9LFxuXG4gIC8vIEZldGNoIHRoZSBpdGVtcyBvZiBgc2VxYCBpbnRvIGFuIGFycmF5LCB3aGVyZSBgc2VxYCBpcyBvZiBvbmUgb2YgdGhlXG4gIC8vIHNlcXVlbmNlIHR5cGVzIGFjY2VwdGVkIGJ5IGBvYnNlcnZlYC4gIElmIGBzZXFgIGlzIGEgY3Vyc29yLCBhXG4gIC8vIGRlcGVuZGVuY3kgaXMgZXN0YWJsaXNoZWQuXG4gIGZldGNoOiBmdW5jdGlvbiAoc2VxKSB7XG4gICAgaWYgKCFzZXEpIHtcbiAgICAgIHJldHVybiBbXTtcbiAgICB9IGVsc2UgaWYgKGlzQXJyYXkoc2VxKSkge1xuICAgICAgcmV0dXJuIHNlcTtcbiAgICB9IGVsc2UgaWYgKGlzU3RvcmVDdXJzb3Ioc2VxKSkge1xuICAgICAgcmV0dXJuIHNlcS5mZXRjaCgpO1xuICAgIH0gZWxzZSBpZiAoaXNJdGVyYWJsZShzZXEpKSB7XG4gICAgICByZXR1cm4gQXJyYXkuZnJvbShzZXEpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBiYWRTZXF1ZW5jZUVycm9yKHNlcSk7XG4gICAgfVxuICB9XG59O1xuXG5mdW5jdGlvbiBlbGxpcHNpcyhsb25nU3RyLCBtYXhMZW5ndGgpIHtcbiAgaWYoIW1heExlbmd0aCkgbWF4TGVuZ3RoID0gMTAwO1xuICBpZihsb25nU3RyLmxlbmd0aCA8IG1heExlbmd0aCkgcmV0dXJuIGxvbmdTdHI7XG4gIHJldHVybiBsb25nU3RyLnN1YnN0cigwLCBtYXhMZW5ndGgtMSkgKyAn4oCmJztcbn1cblxuZnVuY3Rpb24gYXJyYXlUb0RlYnVnU3RyKHZhbHVlLCBtYXhMZW5ndGgpIHtcbiAgdmFyIG91dCA9ICcnLCBzZXAgPSAnJztcbiAgZm9yKHZhciBpID0gMDsgaSA8IHZhbHVlLmxlbmd0aDsgaSsrKSB7XG4gICAgdmFyIGl0ZW0gPSB2YWx1ZVtpXTtcbiAgICBvdXQgKz0gc2VwICsgdG9EZWJ1Z1N0cihpdGVtLCBtYXhMZW5ndGgpO1xuICAgIGlmKG91dC5sZW5ndGggPiBtYXhMZW5ndGgpIHJldHVybiBvdXQ7XG4gICAgc2VwID0gJywgJztcbiAgfVxuICByZXR1cm4gb3V0O1xufVxuXG5mdW5jdGlvbiB0b0RlYnVnU3RyKHZhbHVlLCBtYXhMZW5ndGgpIHtcbiAgaWYoIW1heExlbmd0aCkgbWF4TGVuZ3RoID0gMTUwO1xuICBjb25zdCB0eXBlID0gdHlwZW9mIHZhbHVlO1xuICBzd2l0Y2godHlwZSkge1xuICAgIGNhc2UgJ3VuZGVmaW5lZCc6XG4gICAgICByZXR1cm4gdHlwZTtcbiAgICBjYXNlICdudW1iZXInOlxuICAgICAgcmV0dXJuIHZhbHVlLnRvU3RyaW5nKCk7XG4gICAgY2FzZSAnc3RyaW5nJzpcbiAgICAgIHJldHVybiBKU09OLnN0cmluZ2lmeSh2YWx1ZSk7IC8vIGFkZCBxdW90ZXNcbiAgICBjYXNlICdvYmplY3QnOlxuICAgICAgaWYodmFsdWUgPT09IG51bGwpIHtcbiAgICAgICAgcmV0dXJuICdudWxsJztcbiAgICAgIH0gZWxzZSBpZihBcnJheS5pc0FycmF5KHZhbHVlKSkge1xuICAgICAgICByZXR1cm4gJ0FycmF5IFsnICsgYXJyYXlUb0RlYnVnU3RyKHZhbHVlLCBtYXhMZW5ndGgpICsgJ10nO1xuICAgICAgfSBlbHNlIGlmKFN5bWJvbC5pdGVyYXRvciBpbiB2YWx1ZSkgeyAvLyBNYXAgYW5kIFNldCBhcmUgbm90IGhhbmRsZWQgYnkgSlNPTi5zdHJpbmdpZnlcbiAgICAgICAgcmV0dXJuIHZhbHVlLmNvbnN0cnVjdG9yLm5hbWVcbiAgICAgICAgICArICcgWycgKyBhcnJheVRvRGVidWdTdHIoQXJyYXkuZnJvbSh2YWx1ZSksIG1heExlbmd0aClcbiAgICAgICAgICArICddJzsgLy8gQXJyYXkuZnJvbSBkb2Vzbid0IHdvcmsgaW4gSUUsIGJ1dCBuZWl0aGVyIGRvIGl0ZXJhdG9ycyBzbyBpdCdzIHVucmVhY2hhYmxlXG4gICAgICB9IGVsc2UgeyAvLyB1c2UgSlNPTi5zdHJpbmdpZnkgKHNvbWV0aW1lcyB0b1N0cmluZyBjYW4gYmUgYmV0dGVyIGJ1dCB3ZSBkb24ndCBrbm93KVxuICAgICAgICByZXR1cm4gdmFsdWUuY29uc3RydWN0b3IubmFtZSArICcgJ1xuICAgICAgICAgICAgICsgZWxsaXBzaXMoSlNPTi5zdHJpbmdpZnkodmFsdWUpLCBtYXhMZW5ndGgpO1xuICAgICAgfVxuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gdHlwZSArICc6ICcgKyB2YWx1ZS50b1N0cmluZygpO1xuICB9XG59XG5cbmZ1bmN0aW9uIHNlcXVlbmNlR290VmFsdWUoc2VxdWVuY2UpIHtcbiAgdHJ5IHtcbiAgICByZXR1cm4gJyBHb3QgJyArIHRvRGVidWdTdHIoc2VxdWVuY2UpO1xuICB9IGNhdGNoKGUpIHtcbiAgICByZXR1cm4gJydcbiAgfVxufVxuXG5jb25zdCBiYWRTZXF1ZW5jZUVycm9yID0gZnVuY3Rpb24gKHNlcXVlbmNlKSB7XG4gIHJldHVybiBuZXcgRXJyb3IoXCJ7eyNlYWNofX0gY3VycmVudGx5IG9ubHkgYWNjZXB0cyBcIiArXG4gICAgICAgICAgICAgICAgICAgXCJhcnJheXMsIGN1cnNvcnMsIGl0ZXJhYmxlcyBvciBmYWxzZXkgdmFsdWVzLlwiICtcbiAgICAgICAgICAgICAgICAgICBzZXF1ZW5jZUdvdFZhbHVlKHNlcXVlbmNlKSk7XG59O1xuXG5jb25zdCBpc0Z1bmN0aW9uID0gKGZ1bmMpID0+IHtcbiAgcmV0dXJuIHR5cGVvZiBmdW5jID09PSBcImZ1bmN0aW9uXCI7XG59XG5cbmNvbnN0IGlzU3RvcmVDdXJzb3IgPSBmdW5jdGlvbiAoY3Vyc29yKSB7XG4gIHJldHVybiBjdXJzb3IgJiYgaXNPYmplY3QoY3Vyc29yKSAmJlxuICAgIGlzRnVuY3Rpb24oY3Vyc29yLm9ic2VydmUpICYmIGlzRnVuY3Rpb24oY3Vyc29yLmZldGNoKTtcbn07XG5cbi8vIENhbGN1bGF0ZXMgdGhlIGRpZmZlcmVuY2VzIGJldHdlZW4gYGxhc3RTZXFBcnJheWAgYW5kXG4vLyBgc2VxQXJyYXlgIGFuZCBjYWxscyBhcHByb3ByaWF0ZSBmdW5jdGlvbnMgZnJvbSBgY2FsbGJhY2tzYC5cbi8vIFJldXNlcyBNaW5pbW9uZ28ncyBkaWZmIGFsZ29yaXRobSBpbXBsZW1lbnRhdGlvbi5cbmNvbnN0IGRpZmZBcnJheSA9IGZ1bmN0aW9uIChsYXN0U2VxQXJyYXksIHNlcUFycmF5LCBjYWxsYmFja3MpIHtcbiAgdmFyIGRpZmZGbiA9IFBhY2thZ2VbJ2RpZmYtc2VxdWVuY2UnXS5EaWZmU2VxdWVuY2UuZGlmZlF1ZXJ5T3JkZXJlZENoYW5nZXM7XG4gIHZhciBvbGRJZE9iamVjdHMgPSBbXTtcbiAgdmFyIG5ld0lkT2JqZWN0cyA9IFtdO1xuICB2YXIgcG9zT2xkID0ge307IC8vIG1hcHMgZnJvbSBpZFN0cmluZ2lmeSdkIGlkc1xuICB2YXIgcG9zTmV3ID0ge307IC8vIGRpdHRvXG4gIHZhciBwb3NDdXIgPSB7fTtcbiAgdmFyIGxlbmd0aEN1ciA9IGxhc3RTZXFBcnJheS5sZW5ndGg7XG5cbiAgc2VxQXJyYXkuZm9yRWFjaChmdW5jdGlvbiAoZG9jLCBpKSB7XG4gICAgbmV3SWRPYmplY3RzLnB1c2goe19pZDogZG9jLl9pZH0pO1xuICAgIHBvc05ld1tpZFN0cmluZ2lmeShkb2MuX2lkKV0gPSBpO1xuICB9KTtcbiAgbGFzdFNlcUFycmF5LmZvckVhY2goZnVuY3Rpb24gKGRvYywgaSkge1xuICAgIG9sZElkT2JqZWN0cy5wdXNoKHtfaWQ6IGRvYy5faWR9KTtcbiAgICBwb3NPbGRbaWRTdHJpbmdpZnkoZG9jLl9pZCldID0gaTtcbiAgICBwb3NDdXJbaWRTdHJpbmdpZnkoZG9jLl9pZCldID0gaTtcbiAgfSk7XG5cbiAgLy8gQXJyYXlzIGNhbiBjb250YWluIGFyYml0cmFyeSBvYmplY3RzLiBXZSBkb24ndCBkaWZmIHRoZVxuICAvLyBvYmplY3RzLiBJbnN0ZWFkIHdlIGFsd2F5cyBmaXJlICdjaGFuZ2VkQXQnIGNhbGxiYWNrIG9uIGV2ZXJ5XG4gIC8vIG9iamVjdC4gVGhlIGNvbnN1bWVyIG9mIGBvYnNlcnZlLXNlcXVlbmNlYCBzaG91bGQgZGVhbCB3aXRoXG4gIC8vIGl0IGFwcHJvcHJpYXRlbHkuXG4gIGRpZmZGbihvbGRJZE9iamVjdHMsIG5ld0lkT2JqZWN0cywge1xuICAgIGFkZGVkQmVmb3JlOiBmdW5jdGlvbiAoaWQsIGRvYywgYmVmb3JlKSB7XG4gICAgICB2YXIgcG9zaXRpb24gPSBiZWZvcmUgPyBwb3NDdXJbaWRTdHJpbmdpZnkoYmVmb3JlKV0gOiBsZW5ndGhDdXI7XG5cbiAgICAgIGlmIChiZWZvcmUpIHtcbiAgICAgICAgLy8gSWYgbm90IGFkZGluZyBhdCB0aGUgZW5kLCB3ZSBuZWVkIHRvIHVwZGF0ZSBpbmRleGVzLlxuICAgICAgICAvLyBYWFggdGhpcyBjYW4gc3RpbGwgYmUgaW1wcm92ZWQgZ3JlYXRseSFcbiAgICAgICAgT2JqZWN0LmVudHJpZXMocG9zQ3VyKS5mb3JFYWNoKGZ1bmN0aW9uIChbaWQsIHBvc10pIHtcbiAgICAgICAgICBpZiAocG9zID49IHBvc2l0aW9uKVxuICAgICAgICAgICAgcG9zQ3VyW2lkXSsrO1xuICAgICAgICB9KTtcbiAgICAgIH1cblxuICAgICAgbGVuZ3RoQ3VyKys7XG4gICAgICBwb3NDdXJbaWRTdHJpbmdpZnkoaWQpXSA9IHBvc2l0aW9uO1xuXG4gICAgICBjYWxsYmFja3MuYWRkZWRBdChcbiAgICAgICAgaWQsXG4gICAgICAgIHNlcUFycmF5W3Bvc05ld1tpZFN0cmluZ2lmeShpZCldXS5pdGVtLFxuICAgICAgICBwb3NpdGlvbixcbiAgICAgICAgYmVmb3JlKTtcbiAgICB9LFxuICAgIG1vdmVkQmVmb3JlOiBmdW5jdGlvbiAoaWQsIGJlZm9yZSkge1xuICAgICAgaWYgKGlkID09PSBiZWZvcmUpXG4gICAgICAgIHJldHVybjtcblxuICAgICAgdmFyIG9sZFBvc2l0aW9uID0gcG9zQ3VyW2lkU3RyaW5naWZ5KGlkKV07XG4gICAgICB2YXIgbmV3UG9zaXRpb24gPSBiZWZvcmUgPyBwb3NDdXJbaWRTdHJpbmdpZnkoYmVmb3JlKV0gOiBsZW5ndGhDdXI7XG5cbiAgICAgIC8vIE1vdmluZyB0aGUgaXRlbSBmb3J3YXJkLiBUaGUgbmV3IGVsZW1lbnQgaXMgbG9zaW5nIG9uZSBwb3NpdGlvbiBhcyBpdFxuICAgICAgLy8gd2FzIHJlbW92ZWQgZnJvbSB0aGUgb2xkIHBvc2l0aW9uIGJlZm9yZSBiZWluZyBpbnNlcnRlZCBhdCB0aGUgbmV3XG4gICAgICAvLyBwb3NpdGlvbi5cbiAgICAgIC8vIEV4LjogICAwICAqMSogIDIgICAzICAgNFxuICAgICAgLy8gICAgICAgIDAgICAyICAgMyAgKjEqICA0XG4gICAgICAvLyBUaGUgb3JpZ2luYWwgaXNzdWVkIGNhbGxiYWNrIGlzIFwiMVwiIGJlZm9yZSBcIjRcIi5cbiAgICAgIC8vIFRoZSBwb3NpdGlvbiBvZiBcIjFcIiBpcyAxLCB0aGUgcG9zaXRpb24gb2YgXCI0XCIgaXMgNC5cbiAgICAgIC8vIFRoZSBnZW5lcmF0ZWQgbW92ZSBpcyAoMSkgLT4gKDMpXG4gICAgICBpZiAobmV3UG9zaXRpb24gPiBvbGRQb3NpdGlvbikge1xuICAgICAgICBuZXdQb3NpdGlvbi0tO1xuICAgICAgfVxuXG4gICAgICAvLyBGaXggdXAgdGhlIHBvc2l0aW9ucyBvZiBlbGVtZW50cyBiZXR3ZWVuIHRoZSBvbGQgYW5kIHRoZSBuZXcgcG9zaXRpb25zXG4gICAgICAvLyBvZiB0aGUgbW92ZWQgZWxlbWVudC5cbiAgICAgIC8vXG4gICAgICAvLyBUaGVyZSBhcmUgdHdvIGNhc2VzOlxuICAgICAgLy8gICAxLiBUaGUgZWxlbWVudCBpcyBtb3ZlZCBmb3J3YXJkLiBUaGVuIGFsbCB0aGUgcG9zaXRpb25zIGluIGJldHdlZW5cbiAgICAgIC8vICAgYXJlIG1vdmVkIGJhY2suXG4gICAgICAvLyAgIDIuIFRoZSBlbGVtZW50IGlzIG1vdmVkIGJhY2suIFRoZW4gdGhlIHBvc2l0aW9ucyBpbiBiZXR3ZWVuICphbmQqIHRoZVxuICAgICAgLy8gICBlbGVtZW50IHRoYXQgaXMgY3VycmVudGx5IHN0YW5kaW5nIG9uIHRoZSBtb3ZlZCBlbGVtZW50J3MgZnV0dXJlXG4gICAgICAvLyAgIHBvc2l0aW9uIGFyZSBtb3ZlZCBmb3J3YXJkLlxuICAgICAgT2JqZWN0LmVudHJpZXMocG9zQ3VyKS5mb3JFYWNoKGZ1bmN0aW9uIChbaWQsIGVsQ3VyUG9zaXRpb25dKSB7XG4gICAgICAgIGlmIChvbGRQb3NpdGlvbiA8IGVsQ3VyUG9zaXRpb24gJiYgZWxDdXJQb3NpdGlvbiA8IG5ld1Bvc2l0aW9uKVxuICAgICAgICAgIHBvc0N1cltpZF0tLTtcbiAgICAgICAgZWxzZSBpZiAobmV3UG9zaXRpb24gPD0gZWxDdXJQb3NpdGlvbiAmJiBlbEN1clBvc2l0aW9uIDwgb2xkUG9zaXRpb24pXG4gICAgICAgICAgcG9zQ3VyW2lkXSsrO1xuICAgICAgfSk7XG5cbiAgICAgIC8vIEZpbmFsbHksIHVwZGF0ZSB0aGUgcG9zaXRpb24gb2YgdGhlIG1vdmVkIGVsZW1lbnQuXG4gICAgICBwb3NDdXJbaWRTdHJpbmdpZnkoaWQpXSA9IG5ld1Bvc2l0aW9uO1xuXG4gICAgICBjYWxsYmFja3MubW92ZWRUbyhcbiAgICAgICAgaWQsXG4gICAgICAgIHNlcUFycmF5W3Bvc05ld1tpZFN0cmluZ2lmeShpZCldXS5pdGVtLFxuICAgICAgICBvbGRQb3NpdGlvbixcbiAgICAgICAgbmV3UG9zaXRpb24sXG4gICAgICAgIGJlZm9yZSk7XG4gICAgfSxcbiAgICByZW1vdmVkOiBmdW5jdGlvbiAoaWQpIHtcbiAgICAgIHZhciBwcmV2UG9zaXRpb24gPSBwb3NDdXJbaWRTdHJpbmdpZnkoaWQpXTtcblxuICAgICAgT2JqZWN0LmVudHJpZXMocG9zQ3VyKS5mb3JFYWNoKGZ1bmN0aW9uIChbaWQsIHBvc10pIHtcbiAgICAgICAgaWYgKHBvcyA+PSBwcmV2UG9zaXRpb24pXG4gICAgICAgICAgcG9zQ3VyW2lkXS0tO1xuICAgICAgfSk7XG5cbiAgICAgIGRlbGV0ZSBwb3NDdXJbaWRTdHJpbmdpZnkoaWQpXTtcbiAgICAgIGxlbmd0aEN1ci0tO1xuXG4gICAgICBjYWxsYmFja3MucmVtb3ZlZEF0KFxuICAgICAgICBpZCxcbiAgICAgICAgbGFzdFNlcUFycmF5W3Bvc09sZFtpZFN0cmluZ2lmeShpZCldXS5pdGVtLFxuICAgICAgICBwcmV2UG9zaXRpb24pO1xuICAgIH1cbiAgfSk7XG4gIFxuICBPYmplY3QuZW50cmllcyhwb3NOZXcpLmZvckVhY2goZnVuY3Rpb24gKFtpZFN0cmluZywgcG9zXSkge1xuXG4gICAgdmFyIGlkID0gaWRQYXJzZShpZFN0cmluZyk7XG4gICAgXG4gICAgaWYgKGhhcyhwb3NPbGQsIGlkU3RyaW5nKSkge1xuICAgICAgLy8gc3BlY2lmaWNhbGx5IGZvciBwcmltaXRpdmUgdHlwZXMsIGNvbXBhcmUgZXF1YWxpdHkgYmVmb3JlXG4gICAgICAvLyBmaXJpbmcgdGhlICdjaGFuZ2VkQXQnIGNhbGxiYWNrLiBvdGhlcndpc2UsIGFsd2F5cyBmaXJlIGl0XG4gICAgICAvLyBiZWNhdXNlIGRvaW5nIGEgZGVlcCBFSlNPTiBjb21wYXJpc29uIGlzIG5vdCBndWFyYW50ZWVkIHRvXG4gICAgICAvLyB3b3JrIChhbiBhcnJheSBjYW4gY29udGFpbiBhcmJpdHJhcnkgb2JqZWN0cywgYW5kICd0cmFuc2Zvcm0nXG4gICAgICAvLyBjYW4gYmUgdXNlZCBvbiBjdXJzb3JzKS4gYWxzbywgZGVlcCBkaWZmaW5nIGlzIG5vdFxuICAgICAgLy8gbmVjZXNzYXJpbHkgdGhlIG1vc3QgZWZmaWNpZW50IChpZiBvbmx5IGEgc3BlY2lmaWMgc3ViZmllbGRcbiAgICAgIC8vIG9mIHRoZSBvYmplY3QgaXMgbGF0ZXIgYWNjZXNzZWQpLlxuICAgICAgdmFyIG5ld0l0ZW0gPSBzZXFBcnJheVtwb3NdLml0ZW07XG4gICAgICB2YXIgb2xkSXRlbSA9IGxhc3RTZXFBcnJheVtwb3NPbGRbaWRTdHJpbmddXS5pdGVtO1xuXG4gICAgICBpZiAodHlwZW9mIG5ld0l0ZW0gPT09ICdvYmplY3QnIHx8IG5ld0l0ZW0gIT09IG9sZEl0ZW0pXG4gICAgICAgICAgY2FsbGJhY2tzLmNoYW5nZWRBdChpZCwgbmV3SXRlbSwgb2xkSXRlbSwgcG9zKTtcbiAgICAgIH1cbiAgfSk7XG59O1xuXG5zZXFDaGFuZ2VkVG9FbXB0eSA9IGZ1bmN0aW9uIChsYXN0U2VxQXJyYXksIGNhbGxiYWNrcykge1xuICByZXR1cm4gW107XG59O1xuXG5zZXFDaGFuZ2VkVG9BcnJheSA9IGZ1bmN0aW9uIChsYXN0U2VxQXJyYXksIGFycmF5LCBjYWxsYmFja3MpIHtcbiAgdmFyIGlkc1VzZWQgPSB7fTtcbiAgdmFyIHNlcUFycmF5ID0gYXJyYXkubWFwKGZ1bmN0aW9uIChpdGVtLCBpbmRleCkge1xuICAgIHZhciBpZDtcbiAgICBpZiAodHlwZW9mIGl0ZW0gPT09ICdzdHJpbmcnKSB7XG4gICAgICAvLyBlbnN1cmUgbm90IGVtcHR5LCBzaW5jZSBvdGhlciBsYXllcnMgKGVnIERvbVJhbmdlKSBhc3N1bWUgdGhpcyBhcyB3ZWxsXG4gICAgICBpZCA9IFwiLVwiICsgaXRlbTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBpdGVtID09PSAnbnVtYmVyJyB8fFxuICAgICAgICAgICAgICAgdHlwZW9mIGl0ZW0gPT09ICdib29sZWFuJyB8fFxuICAgICAgICAgICAgICAgaXRlbSA9PT0gdW5kZWZpbmVkIHx8XG4gICAgICAgICAgICAgICBpdGVtID09PSBudWxsKSB7XG4gICAgICBpZCA9IGl0ZW07XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgaXRlbSA9PT0gJ29iamVjdCcpIHtcbiAgICAgIGlkID0gKGl0ZW0gJiYgKCdfaWQnIGluIGl0ZW0pKSA/IGl0ZW0uX2lkIDogaW5kZXg7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcInt7I2VhY2h9fSBkb2Vzbid0IHN1cHBvcnQgYXJyYXlzIHdpdGggXCIgK1xuICAgICAgICAgICAgICAgICAgICAgIFwiZWxlbWVudHMgb2YgdHlwZSBcIiArIHR5cGVvZiBpdGVtKTtcbiAgICB9XG5cbiAgICB2YXIgaWRTdHJpbmcgPSBpZFN0cmluZ2lmeShpZCk7XG4gICAgaWYgKGlkc1VzZWRbaWRTdHJpbmddKSB7XG4gICAgICBpZiAoaXRlbSAmJiB0eXBlb2YgaXRlbSA9PT0gJ29iamVjdCcgJiYgJ19pZCcgaW4gaXRlbSlcbiAgICAgICAgd2FybihcImR1cGxpY2F0ZSBpZCBcIiArIGlkICsgXCIgaW5cIiwgYXJyYXkpO1xuICAgICAgaWQgPSBSYW5kb20uaWQoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgaWRzVXNlZFtpZFN0cmluZ10gPSB0cnVlO1xuICAgIH1cblxuICAgIHJldHVybiB7IF9pZDogaWQsIGl0ZW06IGl0ZW0gfTtcbiAgfSk7XG5cbiAgcmV0dXJuIHNlcUFycmF5O1xufTtcblxuc2VxQ2hhbmdlZFRvQ3Vyc29yID0gZnVuY3Rpb24gKGxhc3RTZXFBcnJheSwgY3Vyc29yLCBjYWxsYmFja3MpIHtcbiAgdmFyIGluaXRpYWwgPSB0cnVlOyAvLyBhcmUgd2Ugb2JzZXJ2aW5nIGluaXRpYWwgZGF0YSBmcm9tIGN1cnNvcj9cbiAgdmFyIHNlcUFycmF5ID0gW107XG5cbiAgdmFyIG9ic2VydmVIYW5kbGUgPSBjdXJzb3Iub2JzZXJ2ZSh7XG4gICAgYWRkZWRBdDogZnVuY3Rpb24gKGRvY3VtZW50LCBhdEluZGV4LCBiZWZvcmUpIHtcbiAgICAgIGlmIChpbml0aWFsKSB7XG4gICAgICAgIC8vIGtlZXAgdHJhY2sgb2YgaW5pdGlhbCBkYXRhIHNvIHRoYXQgd2UgY2FuIGRpZmYgb25jZVxuICAgICAgICAvLyB3ZSBleGl0IGBvYnNlcnZlYC5cbiAgICAgICAgaWYgKGJlZm9yZSAhPT0gbnVsbClcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3RlZCBpbml0aWFsIGRhdGEgZnJvbSBvYnNlcnZlIGluIG9yZGVyXCIpO1xuICAgICAgICBzZXFBcnJheS5wdXNoKHsgX2lkOiBkb2N1bWVudC5faWQsIGl0ZW06IGRvY3VtZW50IH0pO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY2FsbGJhY2tzLmFkZGVkQXQoZG9jdW1lbnQuX2lkLCBkb2N1bWVudCwgYXRJbmRleCwgYmVmb3JlKTtcbiAgICAgIH1cbiAgICB9LFxuICAgIGNoYW5nZWRBdDogZnVuY3Rpb24gKG5ld0RvY3VtZW50LCBvbGREb2N1bWVudCwgYXRJbmRleCkge1xuICAgICAgY2FsbGJhY2tzLmNoYW5nZWRBdChuZXdEb2N1bWVudC5faWQsIG5ld0RvY3VtZW50LCBvbGREb2N1bWVudCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgYXRJbmRleCk7XG4gICAgfSxcbiAgICByZW1vdmVkQXQ6IGZ1bmN0aW9uIChvbGREb2N1bWVudCwgYXRJbmRleCkge1xuICAgICAgY2FsbGJhY2tzLnJlbW92ZWRBdChvbGREb2N1bWVudC5faWQsIG9sZERvY3VtZW50LCBhdEluZGV4KTtcbiAgICB9LFxuICAgIG1vdmVkVG86IGZ1bmN0aW9uIChkb2N1bWVudCwgZnJvbUluZGV4LCB0b0luZGV4LCBiZWZvcmUpIHtcbiAgICAgIGNhbGxiYWNrcy5tb3ZlZFRvKFxuICAgICAgICBkb2N1bWVudC5faWQsIGRvY3VtZW50LCBmcm9tSW5kZXgsIHRvSW5kZXgsIGJlZm9yZSk7XG4gICAgfVxuICB9KTtcbiAgaW5pdGlhbCA9IGZhbHNlO1xuXG4gIHJldHVybiBbc2VxQXJyYXksIG9ic2VydmVIYW5kbGVdO1xufTtcbiJdfQ==
