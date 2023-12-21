(function () {

/* Imports */
var Meteor = Package.meteor.Meteor;
var global = Package.meteor.global;
var meteorEnv = Package.meteor.meteorEnv;
var NpmModuleMongodb = Package['npm-mongo'].NpmModuleMongodb;
var NpmModuleMongodbVersion = Package['npm-mongo'].NpmModuleMongodbVersion;
var AllowDeny = Package['allow-deny'].AllowDeny;
var Random = Package.random.Random;
var EJSON = Package.ejson.EJSON;
var LocalCollection = Package.minimongo.LocalCollection;
var Minimongo = Package.minimongo.Minimongo;
var DDP = Package['ddp-client'].DDP;
var DDPServer = Package['ddp-server'].DDPServer;
var Tracker = Package.tracker.Tracker;
var Deps = Package.tracker.Deps;
var DiffSequence = Package['diff-sequence'].DiffSequence;
var MongoID = Package['mongo-id'].MongoID;
var check = Package.check.check;
var Match = Package.check.Match;
var ECMAScript = Package.ecmascript.ECMAScript;
var Log = Package.logging.Log;
var Decimal = Package['mongo-decimal'].Decimal;
var _ = Package.underscore._;
var MaxHeap = Package['binary-heap'].MaxHeap;
var MinHeap = Package['binary-heap'].MinHeap;
var MinMaxHeap = Package['binary-heap'].MinMaxHeap;
var Hook = Package['callback-hook'].Hook;
var meteorInstall = Package.modules.meteorInstall;
var Promise = Package.promise.Promise;

/* Package-scope variables */
var MongoInternals, MongoConnection, CursorDescription, Cursor, listenAll, forEachTrigger, OPLOG_COLLECTION, idForOp, OplogHandle, ObserveMultiplexer, ObserveHandle, PollingObserveDriver, OplogObserveDriver, Mongo, _ref, field, value, selector, callback, options;

var require = meteorInstall({"node_modules":{"meteor":{"mongo":{"mongo_driver.js":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/mongo/mongo_driver.js                                                                                      //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
!function (module1) {
  let _objectSpread;
  module1.link("@babel/runtime/helpers/objectSpread2", {
    default(v) {
      _objectSpread = v;
    }
  }, 0);
  let normalizeProjection;
  module1.link("./mongo_utils", {
    normalizeProjection(v) {
      normalizeProjection = v;
    }
  }, 0);
  let DocFetcher;
  module1.link("./doc_fetcher.js", {
    DocFetcher(v) {
      DocFetcher = v;
    }
  }, 1);
  let ASYNC_CURSOR_METHODS, getAsyncMethodName;
  module1.link("meteor/minimongo/constants", {
    ASYNC_CURSOR_METHODS(v) {
      ASYNC_CURSOR_METHODS = v;
    },
    getAsyncMethodName(v) {
      getAsyncMethodName = v;
    }
  }, 2);
  /**
   * Provide a synchronous Collection API using fibers, backed by
   * MongoDB.  This is only for use on the server, and mostly identical
   * to the client API.
   *
   * NOTE: the public API methods must be run within a fiber. If you call
   * these outside of a fiber they will explode!
   */

  const path = require("path");
  const util = require("util");

  /** @type {import('mongodb')} */
  var MongoDB = NpmModuleMongodb;
  var Future = Npm.require('fibers/future');
  MongoInternals = {};
  MongoInternals.NpmModules = {
    mongodb: {
      version: NpmModuleMongodbVersion,
      module: MongoDB
    }
  };

  // Older version of what is now available via
  // MongoInternals.NpmModules.mongodb.module.  It was never documented, but
  // people do use it.
  // XXX COMPAT WITH 1.0.3.2
  MongoInternals.NpmModule = MongoDB;
  const FILE_ASSET_SUFFIX = 'Asset';
  const ASSETS_FOLDER = 'assets';
  const APP_FOLDER = 'app';

  // This is used to add or remove EJSON from the beginning of everything nested
  // inside an EJSON custom type. It should only be called on pure JSON!
  var replaceNames = function (filter, thing) {
    if (typeof thing === "object" && thing !== null) {
      if (_.isArray(thing)) {
        return _.map(thing, _.bind(replaceNames, null, filter));
      }
      var ret = {};
      _.each(thing, function (value, key) {
        ret[filter(key)] = replaceNames(filter, value);
      });
      return ret;
    }
    return thing;
  };

  // Ensure that EJSON.clone keeps a Timestamp as a Timestamp (instead of just
  // doing a structural clone).
  // XXX how ok is this? what if there are multiple copies of MongoDB loaded?
  MongoDB.Timestamp.prototype.clone = function () {
    // Timestamps should be immutable.
    return this;
  };
  var makeMongoLegal = function (name) {
    return "EJSON" + name;
  };
  var unmakeMongoLegal = function (name) {
    return name.substr(5);
  };
  var replaceMongoAtomWithMeteor = function (document) {
    if (document instanceof MongoDB.Binary) {
      // for backwards compatibility
      if (document.sub_type !== 0) {
        return document;
      }
      var buffer = document.value(true);
      return new Uint8Array(buffer);
    }
    if (document instanceof MongoDB.ObjectID) {
      return new Mongo.ObjectID(document.toHexString());
    }
    if (document instanceof MongoDB.Decimal128) {
      return Decimal(document.toString());
    }
    if (document["EJSON$type"] && document["EJSON$value"] && _.size(document) === 2) {
      return EJSON.fromJSONValue(replaceNames(unmakeMongoLegal, document));
    }
    if (document instanceof MongoDB.Timestamp) {
      // For now, the Meteor representation of a Mongo timestamp type (not a date!
      // this is a weird internal thing used in the oplog!) is the same as the
      // Mongo representation. We need to do this explicitly or else we would do a
      // structural clone and lose the prototype.
      return document;
    }
    return undefined;
  };
  var replaceMeteorAtomWithMongo = function (document) {
    if (EJSON.isBinary(document)) {
      // This does more copies than we'd like, but is necessary because
      // MongoDB.BSON only looks like it takes a Uint8Array (and doesn't actually
      // serialize it correctly).
      return new MongoDB.Binary(Buffer.from(document));
    }
    if (document instanceof MongoDB.Binary) {
      return document;
    }
    if (document instanceof Mongo.ObjectID) {
      return new MongoDB.ObjectID(document.toHexString());
    }
    if (document instanceof MongoDB.Timestamp) {
      // For now, the Meteor representation of a Mongo timestamp type (not a date!
      // this is a weird internal thing used in the oplog!) is the same as the
      // Mongo representation. We need to do this explicitly or else we would do a
      // structural clone and lose the prototype.
      return document;
    }
    if (document instanceof Decimal) {
      return MongoDB.Decimal128.fromString(document.toString());
    }
    if (EJSON._isCustomType(document)) {
      return replaceNames(makeMongoLegal, EJSON.toJSONValue(document));
    }
    // It is not ordinarily possible to stick dollar-sign keys into mongo
    // so we don't bother checking for things that need escaping at this time.
    return undefined;
  };
  var replaceTypes = function (document, atomTransformer) {
    if (typeof document !== 'object' || document === null) return document;
    var replacedTopLevelAtom = atomTransformer(document);
    if (replacedTopLevelAtom !== undefined) return replacedTopLevelAtom;
    var ret = document;
    _.each(document, function (val, key) {
      var valReplaced = replaceTypes(val, atomTransformer);
      if (val !== valReplaced) {
        // Lazy clone. Shallow copy.
        if (ret === document) ret = _.clone(document);
        ret[key] = valReplaced;
      }
    });
    return ret;
  };
  MongoConnection = function (url, options) {
    var _Meteor$settings, _Meteor$settings$pack, _Meteor$settings$pack2;
    var self = this;
    options = options || {};
    self._observeMultiplexers = {};
    self._onFailoverHook = new Hook();
    const userOptions = _objectSpread(_objectSpread({}, Mongo._connectionOptions || {}), ((_Meteor$settings = Meteor.settings) === null || _Meteor$settings === void 0 ? void 0 : (_Meteor$settings$pack = _Meteor$settings.packages) === null || _Meteor$settings$pack === void 0 ? void 0 : (_Meteor$settings$pack2 = _Meteor$settings$pack.mongo) === null || _Meteor$settings$pack2 === void 0 ? void 0 : _Meteor$settings$pack2.options) || {});
    var mongoOptions = Object.assign({
      ignoreUndefined: true
    }, userOptions);

    // Internally the oplog connections specify their own maxPoolSize
    // which we don't want to overwrite with any user defined value
    if (_.has(options, 'maxPoolSize')) {
      // If we just set this for "server", replSet will override it. If we just
      // set it for replSet, it will be ignored if we're not using a replSet.
      mongoOptions.maxPoolSize = options.maxPoolSize;
    }

    // Transform options like "tlsCAFileAsset": "filename.pem" into
    // "tlsCAFile": "/<fullpath>/filename.pem"
    Object.entries(mongoOptions || {}).filter(_ref => {
      let [key] = _ref;
      return key && key.endsWith(FILE_ASSET_SUFFIX);
    }).forEach(_ref2 => {
      let [key, value] = _ref2;
      const optionName = key.replace(FILE_ASSET_SUFFIX, '');
      mongoOptions[optionName] = path.join(Assets.getServerDir(), ASSETS_FOLDER, APP_FOLDER, value);
      delete mongoOptions[key];
    });
    self.db = null;
    self._oplogHandle = null;
    self._docFetcher = null;
    self.client = new MongoDB.MongoClient(url, mongoOptions);
    self.db = self.client.db();
    self.client.on('serverDescriptionChanged', Meteor.bindEnvironment(event => {
      // When the connection is no longer against the primary node, execute all
      // failover hooks. This is important for the driver as it has to re-pool the
      // query when it happens.
      if (event.previousDescription.type !== 'RSPrimary' && event.newDescription.type === 'RSPrimary') {
        self._onFailoverHook.each(callback => {
          callback();
          return true;
        });
      }
    }));
    if (options.oplogUrl && !Package['disable-oplog']) {
      self._oplogHandle = new OplogHandle(options.oplogUrl, self.db.databaseName);
      self._docFetcher = new DocFetcher(self);
    }
    Promise.await(self.client.connect());
  };
  MongoConnection.prototype.close = function () {
    var self = this;
    if (!self.db) throw Error("close called before Connection created?");

    // XXX probably untested
    var oplogHandle = self._oplogHandle;
    self._oplogHandle = null;
    if (oplogHandle) oplogHandle.stop();

    // Use Future.wrap so that errors get thrown. This happens to
    // work even outside a fiber since the 'close' method is not
    // actually asynchronous.
    Future.wrap(_.bind(self.client.close, self.client))(true).wait();
  };

  // Returns the Mongo Collection object; may yield.
  MongoConnection.prototype.rawCollection = function (collectionName) {
    var self = this;
    if (!self.db) throw Error("rawCollection called before Connection created?");
    return self.db.collection(collectionName);
  };
  MongoConnection.prototype._createCappedCollection = function (collectionName, byteSize, maxDocuments) {
    var self = this;
    if (!self.db) throw Error("_createCappedCollection called before Connection created?");
    var future = new Future();
    self.db.createCollection(collectionName, {
      capped: true,
      size: byteSize,
      max: maxDocuments
    }, future.resolver());
    future.wait();
  };

  // This should be called synchronously with a write, to create a
  // transaction on the current write fence, if any. After we can read
  // the write, and after observers have been notified (or at least,
  // after the observer notifiers have added themselves to the write
  // fence), you should call 'committed()' on the object returned.
  MongoConnection.prototype._maybeBeginWrite = function () {
    var fence = DDPServer._CurrentWriteFence.get();
    if (fence) {
      return fence.beginWrite();
    } else {
      return {
        committed: function () {}
      };
    }
  };

  // Internal interface: adds a callback which is called when the Mongo primary
  // changes. Returns a stop handle.
  MongoConnection.prototype._onFailover = function (callback) {
    return this._onFailoverHook.register(callback);
  };

  //////////// Public API //////////

  // The write methods block until the database has confirmed the write (it may
  // not be replicated or stable on disk, but one server has confirmed it) if no
  // callback is provided. If a callback is provided, then they call the callback
  // when the write is confirmed. They return nothing on success, and raise an
  // exception on failure.
  //
  // After making a write (with insert, update, remove), observers are
  // notified asynchronously. If you want to receive a callback once all
  // of the observer notifications have landed for your write, do the
  // writes inside a write fence (set DDPServer._CurrentWriteFence to a new
  // _WriteFence, and then set a callback on the write fence.)
  //
  // Since our execution environment is single-threaded, this is
  // well-defined -- a write "has been made" if it's returned, and an
  // observer "has been notified" if its callback has returned.

  var writeCallback = function (write, refresh, callback) {
    return function (err, result) {
      if (!err) {
        // XXX We don't have to run this on error, right?
        try {
          refresh();
        } catch (refreshErr) {
          if (callback) {
            callback(refreshErr);
            return;
          } else {
            throw refreshErr;
          }
        }
      }
      write.committed();
      if (callback) {
        callback(err, result);
      } else if (err) {
        throw err;
      }
    };
  };
  var bindEnvironmentForWrite = function (callback) {
    return Meteor.bindEnvironment(callback, "Mongo write");
  };
  MongoConnection.prototype._insert = function (collection_name, document, callback) {
    var self = this;
    var sendError = function (e) {
      if (callback) return callback(e);
      throw e;
    };
    if (collection_name === "___meteor_failure_test_collection") {
      var e = new Error("Failure test");
      e._expectedByTest = true;
      sendError(e);
      return;
    }
    if (!(LocalCollection._isPlainObject(document) && !EJSON._isCustomType(document))) {
      sendError(new Error("Only plain objects may be inserted into MongoDB"));
      return;
    }
    var write = self._maybeBeginWrite();
    var refresh = function () {
      Meteor.refresh({
        collection: collection_name,
        id: document._id
      });
    };
    callback = bindEnvironmentForWrite(writeCallback(write, refresh, callback));
    try {
      var collection = self.rawCollection(collection_name);
      collection.insertOne(replaceTypes(document, replaceMeteorAtomWithMongo), {
        safe: true
      }).then(_ref3 => {
        let {
          insertedId
        } = _ref3;
        callback(null, insertedId);
      }).catch(e => {
        callback(e, null);
      });
    } catch (err) {
      write.committed();
      throw err;
    }
  };

  // Cause queries that may be affected by the selector to poll in this write
  // fence.
  MongoConnection.prototype._refresh = function (collectionName, selector) {
    var refreshKey = {
      collection: collectionName
    };
    // If we know which documents we're removing, don't poll queries that are
    // specific to other documents. (Note that multiple notifications here should
    // not cause multiple polls, since all our listener is doing is enqueueing a
    // poll.)
    var specificIds = LocalCollection._idsMatchedBySelector(selector);
    if (specificIds) {
      _.each(specificIds, function (id) {
        Meteor.refresh(_.extend({
          id: id
        }, refreshKey));
      });
    } else {
      Meteor.refresh(refreshKey);
    }
  };
  MongoConnection.prototype._remove = function (collection_name, selector, callback) {
    var self = this;
    if (collection_name === "___meteor_failure_test_collection") {
      var e = new Error("Failure test");
      e._expectedByTest = true;
      if (callback) {
        return callback(e);
      } else {
        throw e;
      }
    }
    var write = self._maybeBeginWrite();
    var refresh = function () {
      self._refresh(collection_name, selector);
    };
    callback = bindEnvironmentForWrite(writeCallback(write, refresh, callback));
    try {
      var collection = self.rawCollection(collection_name);
      collection.deleteMany(replaceTypes(selector, replaceMeteorAtomWithMongo), {
        safe: true
      }).then(_ref4 => {
        let {
          deletedCount
        } = _ref4;
        callback(null, transformResult({
          result: {
            modifiedCount: deletedCount
          }
        }).numberAffected);
      }).catch(err => {
        callback(err);
      });
    } catch (err) {
      write.committed();
      throw err;
    }
  };
  MongoConnection.prototype._dropCollection = function (collectionName, cb) {
    var self = this;
    var write = self._maybeBeginWrite();
    var refresh = function () {
      Meteor.refresh({
        collection: collectionName,
        id: null,
        dropCollection: true
      });
    };
    cb = bindEnvironmentForWrite(writeCallback(write, refresh, cb));
    try {
      var collection = self.rawCollection(collectionName);
      collection.drop(cb);
    } catch (e) {
      write.committed();
      throw e;
    }
  };

  // For testing only.  Slightly better than `c.rawDatabase().dropDatabase()`
  // because it lets the test's fence wait for it to be complete.
  MongoConnection.prototype._dropDatabase = function (cb) {
    var self = this;
    var write = self._maybeBeginWrite();
    var refresh = function () {
      Meteor.refresh({
        dropDatabase: true
      });
    };
    cb = bindEnvironmentForWrite(writeCallback(write, refresh, cb));
    try {
      self.db.dropDatabase(cb);
    } catch (e) {
      write.committed();
      throw e;
    }
  };
  MongoConnection.prototype._update = function (collection_name, selector, mod, options, callback) {
    var self = this;
    if (!callback && options instanceof Function) {
      callback = options;
      options = null;
    }
    if (collection_name === "___meteor_failure_test_collection") {
      var e = new Error("Failure test");
      e._expectedByTest = true;
      if (callback) {
        return callback(e);
      } else {
        throw e;
      }
    }

    // explicit safety check. null and undefined can crash the mongo
    // driver. Although the node driver and minimongo do 'support'
    // non-object modifier in that they don't crash, they are not
    // meaningful operations and do not do anything. Defensively throw an
    // error here.
    if (!mod || typeof mod !== 'object') throw new Error("Invalid modifier. Modifier must be an object.");
    if (!(LocalCollection._isPlainObject(mod) && !EJSON._isCustomType(mod))) {
      throw new Error("Only plain objects may be used as replacement" + " documents in MongoDB");
    }
    if (!options) options = {};
    var write = self._maybeBeginWrite();
    var refresh = function () {
      self._refresh(collection_name, selector);
    };
    callback = writeCallback(write, refresh, callback);
    try {
      var collection = self.rawCollection(collection_name);
      var mongoOpts = {
        safe: true
      };
      // Add support for filtered positional operator
      if (options.arrayFilters !== undefined) mongoOpts.arrayFilters = options.arrayFilters;
      // explictly enumerate options that minimongo supports
      if (options.upsert) mongoOpts.upsert = true;
      if (options.multi) mongoOpts.multi = true;
      // Lets you get a more more full result from MongoDB. Use with caution:
      // might not work with C.upsert (as opposed to C.update({upsert:true}) or
      // with simulated upsert.
      if (options.fullResult) mongoOpts.fullResult = true;
      var mongoSelector = replaceTypes(selector, replaceMeteorAtomWithMongo);
      var mongoMod = replaceTypes(mod, replaceMeteorAtomWithMongo);
      var isModify = LocalCollection._isModificationMod(mongoMod);
      if (options._forbidReplace && !isModify) {
        var err = new Error("Invalid modifier. Replacements are forbidden.");
        if (callback) {
          return callback(err);
        } else {
          throw err;
        }
      }

      // We've already run replaceTypes/replaceMeteorAtomWithMongo on
      // selector and mod.  We assume it doesn't matter, as far as
      // the behavior of modifiers is concerned, whether `_modify`
      // is run on EJSON or on mongo-converted EJSON.

      // Run this code up front so that it fails fast if someone uses
      // a Mongo update operator we don't support.
      let knownId;
      if (options.upsert) {
        try {
          let newDoc = LocalCollection._createUpsertDocument(selector, mod);
          knownId = newDoc._id;
        } catch (err) {
          if (callback) {
            return callback(err);
          } else {
            throw err;
          }
        }
      }
      if (options.upsert && !isModify && !knownId && options.insertedId && !(options.insertedId instanceof Mongo.ObjectID && options.generatedId)) {
        // In case of an upsert with a replacement, where there is no _id defined
        // in either the query or the replacement doc, mongo will generate an id itself.
        // Therefore we need this special strategy if we want to control the id ourselves.

        // We don't need to do this when:
        // - This is not a replacement, so we can add an _id to $setOnInsert
        // - The id is defined by query or mod we can just add it to the replacement doc
        // - The user did not specify any id preference and the id is a Mongo ObjectId,
        //     then we can just let Mongo generate the id

        simulateUpsertWithInsertedId(collection, mongoSelector, mongoMod, options,
        // This callback does not need to be bindEnvironment'ed because
        // simulateUpsertWithInsertedId() wraps it and then passes it through
        // bindEnvironmentForWrite.
        function (error, result) {
          // If we got here via a upsert() call, then options._returnObject will
          // be set and we should return the whole object. Otherwise, we should
          // just return the number of affected docs to match the mongo API.
          if (result && !options._returnObject) {
            callback(error, result.numberAffected);
          } else {
            callback(error, result);
          }
        });
      } else {
        if (options.upsert && !knownId && options.insertedId && isModify) {
          if (!mongoMod.hasOwnProperty('$setOnInsert')) {
            mongoMod.$setOnInsert = {};
          }
          knownId = options.insertedId;
          Object.assign(mongoMod.$setOnInsert, replaceTypes({
            _id: options.insertedId
          }, replaceMeteorAtomWithMongo));
        }
        const strings = Object.keys(mongoMod).filter(key => !key.startsWith("$"));
        let updateMethod = strings.length > 0 ? 'replaceOne' : 'updateMany';
        updateMethod = updateMethod === 'updateMany' && !mongoOpts.multi ? 'updateOne' : updateMethod;
        collection[updateMethod].bind(collection)(mongoSelector, mongoMod, mongoOpts,
        // mongo driver now returns undefined for err in the callback
        bindEnvironmentForWrite(function () {
          let err = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : null;
          let result = arguments.length > 1 ? arguments[1] : undefined;
          if (!err) {
            var meteorResult = transformResult({
              result
            });
            if (meteorResult && options._returnObject) {
              // If this was an upsert() call, and we ended up
              // inserting a new doc and we know its id, then
              // return that id as well.
              if (options.upsert && meteorResult.insertedId) {
                if (knownId) {
                  meteorResult.insertedId = knownId;
                } else if (meteorResult.insertedId instanceof MongoDB.ObjectID) {
                  meteorResult.insertedId = new Mongo.ObjectID(meteorResult.insertedId.toHexString());
                }
              }
              callback(err, meteorResult);
            } else {
              callback(err, meteorResult.numberAffected);
            }
          } else {
            callback(err);
          }
        }));
      }
    } catch (e) {
      write.committed();
      throw e;
    }
  };
  var transformResult = function (driverResult) {
    var meteorResult = {
      numberAffected: 0
    };
    if (driverResult) {
      var mongoResult = driverResult.result;
      // On updates with upsert:true, the inserted values come as a list of
      // upserted values -- even with options.multi, when the upsert does insert,
      // it only inserts one element.
      if (mongoResult.upsertedCount) {
        meteorResult.numberAffected = mongoResult.upsertedCount;
        if (mongoResult.upsertedId) {
          meteorResult.insertedId = mongoResult.upsertedId;
        }
      } else {
        // n was used before Mongo 5.0, in Mongo 5.0 we are not receiving this n
        // field and so we are using modifiedCount instead
        meteorResult.numberAffected = mongoResult.n || mongoResult.matchedCount || mongoResult.modifiedCount;
      }
    }
    return meteorResult;
  };
  var NUM_OPTIMISTIC_TRIES = 3;

  // exposed for testing
  MongoConnection._isCannotChangeIdError = function (err) {
    // Mongo 3.2.* returns error as next Object:
    // {name: String, code: Number, errmsg: String}
    // Older Mongo returns:
    // {name: String, code: Number, err: String}
    var error = err.errmsg || err.err;

    // We don't use the error code here
    // because the error code we observed it producing (16837) appears to be
    // a far more generic error code based on examining the source.
    if (error.indexOf('The _id field cannot be changed') === 0 || error.indexOf("the (immutable) field '_id' was found to have been altered to _id") !== -1) {
      return true;
    }
    return false;
  };
  var simulateUpsertWithInsertedId = function (collection, selector, mod, options, callback) {
    // STRATEGY: First try doing an upsert with a generated ID.
    // If this throws an error about changing the ID on an existing document
    // then without affecting the database, we know we should probably try
    // an update without the generated ID. If it affected 0 documents,
    // then without affecting the database, we the document that first
    // gave the error is probably removed and we need to try an insert again
    // We go back to step one and repeat.
    // Like all "optimistic write" schemes, we rely on the fact that it's
    // unlikely our writes will continue to be interfered with under normal
    // circumstances (though sufficiently heavy contention with writers
    // disagreeing on the existence of an object will cause writes to fail
    // in theory).

    var insertedId = options.insertedId; // must exist
    var mongoOptsForUpdate = {
      safe: true,
      multi: options.multi
    };
    var mongoOptsForInsert = {
      safe: true,
      upsert: true
    };
    var replacementWithId = Object.assign(replaceTypes({
      _id: insertedId
    }, replaceMeteorAtomWithMongo), mod);
    var tries = NUM_OPTIMISTIC_TRIES;
    var doUpdate = function () {
      tries--;
      if (!tries) {
        callback(new Error("Upsert failed after " + NUM_OPTIMISTIC_TRIES + " tries."));
      } else {
        let method = collection.updateMany;
        if (!Object.keys(mod).some(key => key.startsWith("$"))) {
          method = collection.replaceOne.bind(collection);
        }
        method(selector, mod, mongoOptsForUpdate, bindEnvironmentForWrite(function (err, result) {
          if (err) {
            callback(err);
          } else if (result && (result.modifiedCount || result.upsertedCount)) {
            callback(null, {
              numberAffected: result.modifiedCount || result.upsertedCount,
              insertedId: result.upsertedId || undefined
            });
          } else {
            doConditionalInsert();
          }
        }));
      }
    };
    var doConditionalInsert = function () {
      collection.replaceOne(selector, replacementWithId, mongoOptsForInsert, bindEnvironmentForWrite(function (err, result) {
        if (err) {
          // figure out if this is a
          // "cannot change _id of document" error, and
          // if so, try doUpdate() again, up to 3 times.
          if (MongoConnection._isCannotChangeIdError(err)) {
            doUpdate();
          } else {
            callback(err);
          }
        } else {
          callback(null, {
            numberAffected: result.upsertedCount,
            insertedId: result.upsertedId
          });
        }
      }));
    };
    doUpdate();
  };
  _.each(["insert", "update", "remove", "dropCollection", "dropDatabase"], function (method) {
    MongoConnection.prototype[method] = function /* arguments */
    () {
      var self = this;
      return Meteor.wrapAsync(self["_" + method]).apply(self, arguments);
    };
  });

  // XXX MongoConnection.upsert() does not return the id of the inserted document
  // unless you set it explicitly in the selector or modifier (as a replacement
  // doc).
  MongoConnection.prototype.upsert = function (collectionName, selector, mod, options, callback) {
    var self = this;
    if (typeof options === "function" && !callback) {
      callback = options;
      options = {};
    }
    return self.update(collectionName, selector, mod, _.extend({}, options, {
      upsert: true,
      _returnObject: true
    }), callback);
  };
  MongoConnection.prototype.find = function (collectionName, selector, options) {
    var self = this;
    if (arguments.length === 1) selector = {};
    return new Cursor(self, new CursorDescription(collectionName, selector, options));
  };
  MongoConnection.prototype.findOneAsync = function (collection_name, selector, options) {
    return Promise.asyncApply(() => {
      var self = this;
      if (arguments.length === 1) selector = {};
      options = options || {};
      options.limit = 1;
      return Promise.await(self.find(collection_name, selector, options).fetchAsync())[0];
    });
  };
  MongoConnection.prototype.findOne = function (collection_name, selector, options) {
    var self = this;
    return Future.fromPromise(self.findOneAsync(collection_name, selector, options)).wait();
  };
  MongoConnection.prototype.createIndexAsync = function (collectionName, index, options) {
    var self = this;

    // We expect this function to be called at startup, not from within a method,
    // so we don't interact with the write fence.
    var collection = self.rawCollection(collectionName);
    return collection.createIndex(index, options);
  };

  // We'll actually design an index API later. For now, we just pass through to
  // Mongo's, but make it synchronous.
  MongoConnection.prototype.createIndex = function (collectionName, index, options) {
    var self = this;
    return Future.fromPromise(self.createIndexAsync(collectionName, index, options));
  };
  MongoConnection.prototype.countDocuments = function (collectionName) {
    for (var _len = arguments.length, args = new Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
      args[_key - 1] = arguments[_key];
    }
    args = args.map(arg => replaceTypes(arg, replaceMeteorAtomWithMongo));
    const collection = this.rawCollection(collectionName);
    return collection.countDocuments(...args);
  };
  MongoConnection.prototype.estimatedDocumentCount = function (collectionName) {
    for (var _len2 = arguments.length, args = new Array(_len2 > 1 ? _len2 - 1 : 0), _key2 = 1; _key2 < _len2; _key2++) {
      args[_key2 - 1] = arguments[_key2];
    }
    args = args.map(arg => replaceTypes(arg, replaceMeteorAtomWithMongo));
    const collection = this.rawCollection(collectionName);
    return collection.estimatedDocumentCount(...args);
  };
  MongoConnection.prototype._ensureIndex = MongoConnection.prototype.createIndex;
  MongoConnection.prototype._dropIndex = function (collectionName, index) {
    var self = this;

    // This function is only used by test code, not within a method, so we don't
    // interact with the write fence.
    var collection = self.rawCollection(collectionName);
    var future = new Future();
    var indexName = collection.dropIndex(index, future.resolver());
    future.wait();
  };

  // CURSORS

  // There are several classes which relate to cursors:
  //
  // CursorDescription represents the arguments used to construct a cursor:
  // collectionName, selector, and (find) options.  Because it is used as a key
  // for cursor de-dup, everything in it should either be JSON-stringifiable or
  // not affect observeChanges output (eg, options.transform functions are not
  // stringifiable but do not affect observeChanges).
  //
  // SynchronousCursor is a wrapper around a MongoDB cursor
  // which includes fully-synchronous versions of forEach, etc.
  //
  // Cursor is the cursor object returned from find(), which implements the
  // documented Mongo.Collection cursor API.  It wraps a CursorDescription and a
  // SynchronousCursor (lazily: it doesn't contact Mongo until you call a method
  // like fetch or forEach on it).
  //
  // ObserveHandle is the "observe handle" returned from observeChanges. It has a
  // reference to an ObserveMultiplexer.
  //
  // ObserveMultiplexer allows multiple identical ObserveHandles to be driven by a
  // single observe driver.
  //
  // There are two "observe drivers" which drive ObserveMultiplexers:
  //   - PollingObserveDriver caches the results of a query and reruns it when
  //     necessary.
  //   - OplogObserveDriver follows the Mongo operation log to directly observe
  //     database changes.
  // Both implementations follow the same simple interface: when you create them,
  // they start sending observeChanges callbacks (and a ready() invocation) to
  // their ObserveMultiplexer, and you stop them by calling their stop() method.

  CursorDescription = function (collectionName, selector, options) {
    var self = this;
    self.collectionName = collectionName;
    self.selector = Mongo.Collection._rewriteSelector(selector);
    self.options = options || {};
  };
  Cursor = function (mongo, cursorDescription) {
    var self = this;
    self._mongo = mongo;
    self._cursorDescription = cursorDescription;
    self._synchronousCursor = null;
  };
  function setupSynchronousCursor(cursor, method) {
    // You can only observe a tailable cursor.
    if (cursor._cursorDescription.options.tailable) throw new Error('Cannot call ' + method + ' on a tailable cursor');
    if (!cursor._synchronousCursor) {
      cursor._synchronousCursor = cursor._mongo._createSynchronousCursor(cursor._cursorDescription, {
        // Make sure that the "cursor" argument to forEach/map callbacks is the
        // Cursor, not the SynchronousCursor.
        selfForIteration: cursor,
        useTransform: true
      });
    }
    return cursor._synchronousCursor;
  }
  Cursor.prototype.count = function () {
    const collection = this._mongo.rawCollection(this._cursorDescription.collectionName);
    return Promise.await(collection.countDocuments(replaceTypes(this._cursorDescription.selector, replaceMeteorAtomWithMongo), replaceTypes(this._cursorDescription.options, replaceMeteorAtomWithMongo)));
  };
  [...ASYNC_CURSOR_METHODS, Symbol.iterator, Symbol.asyncIterator].forEach(methodName => {
    // count is handled specially since we don't want to create a cursor.
    // it is still included in ASYNC_CURSOR_METHODS because we still want an async version of it to exist.
    if (methodName !== 'count') {
      Cursor.prototype[methodName] = function () {
        const cursor = setupSynchronousCursor(this, methodName);
        return cursor[methodName](...arguments);
      };
    }

    // These methods are handled separately.
    if (methodName === Symbol.iterator || methodName === Symbol.asyncIterator) {
      return;
    }
    const methodNameAsync = getAsyncMethodName(methodName);
    Cursor.prototype[methodNameAsync] = function () {
      try {
        this[methodName].isCalledFromAsync = true;
        return Promise.resolve(this[methodName](...arguments));
      } catch (error) {
        return Promise.reject(error);
      }
    };
  });
  Cursor.prototype.getTransform = function () {
    return this._cursorDescription.options.transform;
  };

  // When you call Meteor.publish() with a function that returns a Cursor, we need
  // to transmute it into the equivalent subscription.  This is the function that
  // does that.

  Cursor.prototype._publishCursor = function (sub) {
    var self = this;
    var collection = self._cursorDescription.collectionName;
    return Mongo.Collection._publishCursor(self, sub, collection);
  };

  // Used to guarantee that publish functions return at most one cursor per
  // collection. Private, because we might later have cursors that include
  // documents from multiple collections somehow.
  Cursor.prototype._getCollectionName = function () {
    var self = this;
    return self._cursorDescription.collectionName;
  };
  Cursor.prototype.observe = function (callbacks) {
    var self = this;
    return LocalCollection._observeFromObserveChanges(self, callbacks);
  };
  Cursor.prototype.observeChanges = function (callbacks) {
    let options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
    var self = this;
    var methods = ['addedAt', 'added', 'changedAt', 'changed', 'removedAt', 'removed', 'movedTo'];
    var ordered = LocalCollection._observeChangesCallbacksAreOrdered(callbacks);
    let exceptionName = callbacks._fromObserve ? 'observe' : 'observeChanges';
    exceptionName += ' callback';
    methods.forEach(function (method) {
      if (callbacks[method] && typeof callbacks[method] == "function") {
        callbacks[method] = Meteor.bindEnvironment(callbacks[method], method + exceptionName);
      }
    });
    return self._mongo._observeChanges(self._cursorDescription, ordered, callbacks, options.nonMutatingCallbacks);
  };
  MongoConnection.prototype._createSynchronousCursor = function (cursorDescription, options) {
    var self = this;
    options = _.pick(options || {}, 'selfForIteration', 'useTransform');
    var collection = self.rawCollection(cursorDescription.collectionName);
    var cursorOptions = cursorDescription.options;
    var mongoOptions = {
      sort: cursorOptions.sort,
      limit: cursorOptions.limit,
      skip: cursorOptions.skip,
      projection: cursorOptions.fields || cursorOptions.projection,
      readPreference: cursorOptions.readPreference
    };

    // Do we want a tailable cursor (which only works on capped collections)?
    if (cursorOptions.tailable) {
      mongoOptions.numberOfRetries = -1;
    }
    var dbCursor = collection.find(replaceTypes(cursorDescription.selector, replaceMeteorAtomWithMongo), mongoOptions);

    // Do we want a tailable cursor (which only works on capped collections)?
    if (cursorOptions.tailable) {
      // We want a tailable cursor...
      dbCursor.addCursorFlag("tailable", true);
      // ... and for the server to wait a bit if any getMore has no data (rather
      // than making us put the relevant sleeps in the client)...
      dbCursor.addCursorFlag("awaitData", true);

      // And if this is on the oplog collection and the cursor specifies a 'ts',
      // then set the undocumented oplog replay flag, which does a special scan to
      // find the first document (instead of creating an index on ts). This is a
      // very hard-coded Mongo flag which only works on the oplog collection and
      // only works with the ts field.
      if (cursorDescription.collectionName === OPLOG_COLLECTION && cursorDescription.selector.ts) {
        dbCursor.addCursorFlag("oplogReplay", true);
      }
    }
    if (typeof cursorOptions.maxTimeMs !== 'undefined') {
      dbCursor = dbCursor.maxTimeMS(cursorOptions.maxTimeMs);
    }
    if (typeof cursorOptions.hint !== 'undefined') {
      dbCursor = dbCursor.hint(cursorOptions.hint);
    }
    return new SynchronousCursor(dbCursor, cursorDescription, options, collection);
  };
  var SynchronousCursor = function (dbCursor, cursorDescription, options, collection) {
    var self = this;
    options = _.pick(options || {}, 'selfForIteration', 'useTransform');
    self._dbCursor = dbCursor;
    self._cursorDescription = cursorDescription;
    // The "self" argument passed to forEach/map callbacks. If we're wrapped
    // inside a user-visible Cursor, we want to provide the outer cursor!
    self._selfForIteration = options.selfForIteration || self;
    if (options.useTransform && cursorDescription.options.transform) {
      self._transform = LocalCollection.wrapTransform(cursorDescription.options.transform);
    } else {
      self._transform = null;
    }
    self._synchronousCount = Future.wrap(collection.countDocuments.bind(collection, replaceTypes(cursorDescription.selector, replaceMeteorAtomWithMongo), replaceTypes(cursorDescription.options, replaceMeteorAtomWithMongo)));
    self._visitedIds = new LocalCollection._IdMap();
  };
  _.extend(SynchronousCursor.prototype, {
    // Returns a Promise for the next object from the underlying cursor (before
    // the Mongo->Meteor type replacement).
    _rawNextObjectPromise: function () {
      const self = this;
      return new Promise((resolve, reject) => {
        self._dbCursor.next((err, doc) => {
          if (err) {
            reject(err);
          } else {
            resolve(doc);
          }
        });
      });
    },
    // Returns a Promise for the next object from the cursor, skipping those whose
    // IDs we've already seen and replacing Mongo atoms with Meteor atoms.
    _nextObjectPromise: function () {
      return Promise.asyncApply(() => {
        var self = this;
        while (true) {
          var doc = Promise.await(self._rawNextObjectPromise());
          if (!doc) return null;
          doc = replaceTypes(doc, replaceMongoAtomWithMeteor);
          if (!self._cursorDescription.options.tailable && _.has(doc, '_id')) {
            // Did Mongo give us duplicate documents in the same cursor? If so,
            // ignore this one. (Do this before the transform, since transform might
            // return some unrelated value.) We don't do this for tailable cursors,
            // because we want to maintain O(1) memory usage. And if there isn't _id
            // for some reason (maybe it's the oplog), then we don't do this either.
            // (Be careful to do this for falsey but existing _id, though.)
            if (self._visitedIds.has(doc._id)) continue;
            self._visitedIds.set(doc._id, true);
          }
          if (self._transform) doc = self._transform(doc);
          return doc;
        }
      });
    },
    // Returns a promise which is resolved with the next object (like with
    // _nextObjectPromise) or rejected if the cursor doesn't return within
    // timeoutMS ms.
    _nextObjectPromiseWithTimeout: function (timeoutMS) {
      const self = this;
      if (!timeoutMS) {
        return self._nextObjectPromise();
      }
      const nextObjectPromise = self._nextObjectPromise();
      const timeoutErr = new Error('Client-side timeout waiting for next object');
      const timeoutPromise = new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(timeoutErr);
        }, timeoutMS);
      });
      return Promise.race([nextObjectPromise, timeoutPromise]).catch(err => {
        if (err === timeoutErr) {
          self.close();
        }
        throw err;
      });
    },
    _nextObject: function () {
      var self = this;
      return self._nextObjectPromise().await();
    },
    forEach: function (callback, thisArg) {
      var self = this;
      const wrappedFn = Meteor.wrapFn(callback);

      // Get back to the beginning.
      self._rewind();

      // We implement the loop ourself instead of using self._dbCursor.each,
      // because "each" will call its callback outside of a fiber which makes it
      // much more complex to make this function synchronous.
      var index = 0;
      while (true) {
        var doc = self._nextObject();
        if (!doc) return;
        wrappedFn.call(thisArg, doc, index++, self._selfForIteration);
      }
    },
    // XXX Allow overlapping callback executions if callback yields.
    map: function (callback, thisArg) {
      var self = this;
      const wrappedFn = Meteor.wrapFn(callback);
      var res = [];
      self.forEach(function (doc, index) {
        res.push(wrappedFn.call(thisArg, doc, index, self._selfForIteration));
      });
      return res;
    },
    _rewind: function () {
      var self = this;

      // known to be synchronous
      self._dbCursor.rewind();
      self._visitedIds = new LocalCollection._IdMap();
    },
    // Mostly usable for tailable cursors.
    close: function () {
      var self = this;
      self._dbCursor.close();
    },
    fetch: function () {
      var self = this;
      return self.map(_.identity);
    },
    count: function () {
      var self = this;
      return self._synchronousCount().wait();
    },
    // This method is NOT wrapped in Cursor.
    getRawObjects: function (ordered) {
      var self = this;
      if (ordered) {
        return self.fetch();
      } else {
        var results = new LocalCollection._IdMap();
        self.forEach(function (doc) {
          results.set(doc._id, doc);
        });
        return results;
      }
    }
  });
  SynchronousCursor.prototype[Symbol.iterator] = function () {
    var self = this;

    // Get back to the beginning.
    self._rewind();
    return {
      next() {
        const doc = self._nextObject();
        return doc ? {
          value: doc
        } : {
          done: true
        };
      }
    };
  };
  SynchronousCursor.prototype[Symbol.asyncIterator] = function () {
    const syncResult = this[Symbol.iterator]();
    return {
      next() {
        return Promise.asyncApply(() => {
          return Promise.resolve(syncResult.next());
        });
      }
    };
  };

  // Tails the cursor described by cursorDescription, most likely on the
  // oplog. Calls docCallback with each document found. Ignores errors and just
  // restarts the tail on error.
  //
  // If timeoutMS is set, then if we don't get a new document every timeoutMS,
  // kill and restart the cursor. This is primarily a workaround for #8598.
  MongoConnection.prototype.tail = function (cursorDescription, docCallback, timeoutMS) {
    var self = this;
    if (!cursorDescription.options.tailable) throw new Error("Can only tail a tailable cursor");
    var cursor = self._createSynchronousCursor(cursorDescription);
    var stopped = false;
    var lastTS;
    var loop = function () {
      var doc = null;
      while (true) {
        if (stopped) return;
        try {
          doc = cursor._nextObjectPromiseWithTimeout(timeoutMS).await();
        } catch (err) {
          // There's no good way to figure out if this was actually an error from
          // Mongo, or just client-side (including our own timeout error). Ah
          // well. But either way, we need to retry the cursor (unless the failure
          // was because the observe got stopped).
          doc = null;
        }
        // Since we awaited a promise above, we need to check again to see if
        // we've been stopped before calling the callback.
        if (stopped) return;
        if (doc) {
          // If a tailable cursor contains a "ts" field, use it to recreate the
          // cursor on error. ("ts" is a standard that Mongo uses internally for
          // the oplog, and there's a special flag that lets you do binary search
          // on it instead of needing to use an index.)
          lastTS = doc.ts;
          docCallback(doc);
        } else {
          var newSelector = _.clone(cursorDescription.selector);
          if (lastTS) {
            newSelector.ts = {
              $gt: lastTS
            };
          }
          cursor = self._createSynchronousCursor(new CursorDescription(cursorDescription.collectionName, newSelector, cursorDescription.options));
          // Mongo failover takes many seconds.  Retry in a bit.  (Without this
          // setTimeout, we peg the CPU at 100% and never notice the actual
          // failover.
          Meteor.setTimeout(loop, 100);
          break;
        }
      }
    };
    Meteor.defer(loop);
    return {
      stop: function () {
        stopped = true;
        cursor.close();
      }
    };
  };
  MongoConnection.prototype._observeChanges = function (cursorDescription, ordered, callbacks, nonMutatingCallbacks) {
    var self = this;
    if (cursorDescription.options.tailable) {
      return self._observeChangesTailable(cursorDescription, ordered, callbacks);
    }

    // You may not filter out _id when observing changes, because the id is a core
    // part of the observeChanges API.
    const fieldsOptions = cursorDescription.options.projection || cursorDescription.options.fields;
    if (fieldsOptions && (fieldsOptions._id === 0 || fieldsOptions._id === false)) {
      throw Error("You may not observe a cursor with {fields: {_id: 0}}");
    }
    var observeKey = EJSON.stringify(_.extend({
      ordered: ordered
    }, cursorDescription));
    var multiplexer, observeDriver;
    var firstHandle = false;

    // Find a matching ObserveMultiplexer, or create a new one. This next block is
    // guaranteed to not yield (and it doesn't call anything that can observe a
    // new query), so no other calls to this function can interleave with it.
    Meteor._noYieldsAllowed(function () {
      if (_.has(self._observeMultiplexers, observeKey)) {
        multiplexer = self._observeMultiplexers[observeKey];
      } else {
        firstHandle = true;
        // Create a new ObserveMultiplexer.
        multiplexer = new ObserveMultiplexer({
          ordered: ordered,
          onStop: function () {
            delete self._observeMultiplexers[observeKey];
            observeDriver.stop();
          }
        });
        self._observeMultiplexers[observeKey] = multiplexer;
      }
    });
    var observeHandle = new ObserveHandle(multiplexer, callbacks, nonMutatingCallbacks);
    if (firstHandle) {
      var matcher, sorter;
      var canUseOplog = _.all([function () {
        // At a bare minimum, using the oplog requires us to have an oplog, to
        // want unordered callbacks, and to not want a callback on the polls
        // that won't happen.
        return self._oplogHandle && !ordered && !callbacks._testOnlyPollCallback;
      }, function () {
        // We need to be able to compile the selector. Fall back to polling for
        // some newfangled $selector that minimongo doesn't support yet.
        try {
          matcher = new Minimongo.Matcher(cursorDescription.selector);
          return true;
        } catch (e) {
          // XXX make all compilation errors MinimongoError or something
          //     so that this doesn't ignore unrelated exceptions
          return false;
        }
      }, function () {
        // ... and the selector itself needs to support oplog.
        return OplogObserveDriver.cursorSupported(cursorDescription, matcher);
      }, function () {
        // And we need to be able to compile the sort, if any.  eg, can't be
        // {$natural: 1}.
        if (!cursorDescription.options.sort) return true;
        try {
          sorter = new Minimongo.Sorter(cursorDescription.options.sort);
          return true;
        } catch (e) {
          // XXX make all compilation errors MinimongoError or something
          //     so that this doesn't ignore unrelated exceptions
          return false;
        }
      }], function (f) {
        return f();
      }); // invoke each function

      var driverClass = canUseOplog ? OplogObserveDriver : PollingObserveDriver;
      observeDriver = new driverClass({
        cursorDescription: cursorDescription,
        mongoHandle: self,
        multiplexer: multiplexer,
        ordered: ordered,
        matcher: matcher,
        // ignored by polling
        sorter: sorter,
        // ignored by polling
        _testOnlyPollCallback: callbacks._testOnlyPollCallback
      });

      // This field is only set for use in tests.
      multiplexer._observeDriver = observeDriver;
    }

    // Blocks until the initial adds have been sent.
    multiplexer.addHandleAndSendInitialAdds(observeHandle);
    return observeHandle;
  };

  // Listen for the invalidation messages that will trigger us to poll the
  // database for changes. If this selector specifies specific IDs, specify them
  // here, so that updates to different specific IDs don't cause us to poll.
  // listenCallback is the same kind of (notification, complete) callback passed
  // to InvalidationCrossbar.listen.

  listenAll = function (cursorDescription, listenCallback) {
    var listeners = [];
    forEachTrigger(cursorDescription, function (trigger) {
      listeners.push(DDPServer._InvalidationCrossbar.listen(trigger, listenCallback));
    });
    return {
      stop: function () {
        _.each(listeners, function (listener) {
          listener.stop();
        });
      }
    };
  };
  forEachTrigger = function (cursorDescription, triggerCallback) {
    var key = {
      collection: cursorDescription.collectionName
    };
    var specificIds = LocalCollection._idsMatchedBySelector(cursorDescription.selector);
    if (specificIds) {
      _.each(specificIds, function (id) {
        triggerCallback(_.extend({
          id: id
        }, key));
      });
      triggerCallback(_.extend({
        dropCollection: true,
        id: null
      }, key));
    } else {
      triggerCallback(key);
    }
    // Everyone cares about the database being dropped.
    triggerCallback({
      dropDatabase: true
    });
  };

  // observeChanges for tailable cursors on capped collections.
  //
  // Some differences from normal cursors:
  //   - Will never produce anything other than 'added' or 'addedBefore'. If you
  //     do update a document that has already been produced, this will not notice
  //     it.
  //   - If you disconnect and reconnect from Mongo, it will essentially restart
  //     the query, which will lead to duplicate results. This is pretty bad,
  //     but if you include a field called 'ts' which is inserted as
  //     new MongoInternals.MongoTimestamp(0, 0) (which is initialized to the
  //     current Mongo-style timestamp), we'll be able to find the place to
  //     restart properly. (This field is specifically understood by Mongo with an
  //     optimization which allows it to find the right place to start without
  //     an index on ts. It's how the oplog works.)
  //   - No callbacks are triggered synchronously with the call (there's no
  //     differentiation between "initial data" and "later changes"; everything
  //     that matches the query gets sent asynchronously).
  //   - De-duplication is not implemented.
  //   - Does not yet interact with the write fence. Probably, this should work by
  //     ignoring removes (which don't work on capped collections) and updates
  //     (which don't affect tailable cursors), and just keeping track of the ID
  //     of the inserted object, and closing the write fence once you get to that
  //     ID (or timestamp?).  This doesn't work well if the document doesn't match
  //     the query, though.  On the other hand, the write fence can close
  //     immediately if it does not match the query. So if we trust minimongo
  //     enough to accurately evaluate the query against the write fence, we
  //     should be able to do this...  Of course, minimongo doesn't even support
  //     Mongo Timestamps yet.
  MongoConnection.prototype._observeChangesTailable = function (cursorDescription, ordered, callbacks) {
    var self = this;

    // Tailable cursors only ever call added/addedBefore callbacks, so it's an
    // error if you didn't provide them.
    if (ordered && !callbacks.addedBefore || !ordered && !callbacks.added) {
      throw new Error("Can't observe an " + (ordered ? "ordered" : "unordered") + " tailable cursor without a " + (ordered ? "addedBefore" : "added") + " callback");
    }
    return self.tail(cursorDescription, function (doc) {
      var id = doc._id;
      delete doc._id;
      // The ts is an implementation detail. Hide it.
      delete doc.ts;
      if (ordered) {
        callbacks.addedBefore(id, doc, null);
      } else {
        callbacks.added(id, doc);
      }
    });
  };

  // XXX We probably need to find a better way to expose this. Right now
  // it's only used by tests, but in fact you need it in normal
  // operation to interact with capped collections.
  MongoInternals.MongoTimestamp = MongoDB.Timestamp;
  MongoInternals.Connection = MongoConnection;
}.call(this, module);
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"oplog_tailing.js":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/mongo/oplog_tailing.js                                                                                     //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
let NpmModuleMongodb;
module.link("meteor/npm-mongo", {
  NpmModuleMongodb(v) {
    NpmModuleMongodb = v;
  }
}, 0);
var Future = Npm.require('fibers/future');
const {
  Long
} = NpmModuleMongodb;
OPLOG_COLLECTION = 'oplog.rs';
var TOO_FAR_BEHIND = process.env.METEOR_OPLOG_TOO_FAR_BEHIND || 2000;
var TAIL_TIMEOUT = +process.env.METEOR_OPLOG_TAIL_TIMEOUT || 30000;
var showTS = function (ts) {
  return "Timestamp(" + ts.getHighBits() + ", " + ts.getLowBits() + ")";
};
idForOp = function (op) {
  if (op.op === 'd') return op.o._id;else if (op.op === 'i') return op.o._id;else if (op.op === 'u') return op.o2._id;else if (op.op === 'c') throw Error("Operator 'c' doesn't supply an object with id: " + EJSON.stringify(op));else throw Error("Unknown op: " + EJSON.stringify(op));
};
OplogHandle = function (oplogUrl, dbName) {
  var self = this;
  self._oplogUrl = oplogUrl;
  self._dbName = dbName;
  self._oplogLastEntryConnection = null;
  self._oplogTailConnection = null;
  self._stopped = false;
  self._tailHandle = null;
  self._readyFuture = new Future();
  self._crossbar = new DDPServer._Crossbar({
    factPackage: "mongo-livedata",
    factName: "oplog-watchers"
  });
  self._baseOplogSelector = {
    ns: new RegExp("^(?:" + [Meteor._escapeRegExp(self._dbName + "."), Meteor._escapeRegExp("admin.$cmd")].join("|") + ")"),
    $or: [{
      op: {
        $in: ['i', 'u', 'd']
      }
    },
    // drop collection
    {
      op: 'c',
      'o.drop': {
        $exists: true
      }
    }, {
      op: 'c',
      'o.dropDatabase': 1
    }, {
      op: 'c',
      'o.applyOps': {
        $exists: true
      }
    }]
  };

  // Data structures to support waitUntilCaughtUp(). Each oplog entry has a
  // MongoTimestamp object on it (which is not the same as a Date --- it's a
  // combination of time and an incrementing counter; see
  // http://docs.mongodb.org/manual/reference/bson-types/#timestamps).
  //
  // _catchingUpFutures is an array of {ts: MongoTimestamp, future: Future}
  // objects, sorted by ascending timestamp. _lastProcessedTS is the
  // MongoTimestamp of the last oplog entry we've processed.
  //
  // Each time we call waitUntilCaughtUp, we take a peek at the final oplog
  // entry in the db.  If we've already processed it (ie, it is not greater than
  // _lastProcessedTS), waitUntilCaughtUp immediately returns. Otherwise,
  // waitUntilCaughtUp makes a new Future and inserts it along with the final
  // timestamp entry that it read, into _catchingUpFutures. waitUntilCaughtUp
  // then waits on that future, which is resolved once _lastProcessedTS is
  // incremented to be past its timestamp by the worker fiber.
  //
  // XXX use a priority queue or something else that's faster than an array
  self._catchingUpFutures = [];
  self._lastProcessedTS = null;
  self._onSkippedEntriesHook = new Hook({
    debugPrintExceptions: "onSkippedEntries callback"
  });
  self._entryQueue = new Meteor._DoubleEndedQueue();
  self._workerActive = false;
  self._startTailing();
};
Object.assign(OplogHandle.prototype, {
  stop: function () {
    var self = this;
    if (self._stopped) return;
    self._stopped = true;
    if (self._tailHandle) self._tailHandle.stop();
    // XXX should close connections too
  },

  onOplogEntry: function (trigger, callback) {
    var self = this;
    if (self._stopped) throw new Error("Called onOplogEntry on stopped handle!");

    // Calling onOplogEntry requires us to wait for the tailing to be ready.
    self._readyFuture.wait();
    var originalCallback = callback;
    callback = Meteor.bindEnvironment(function (notification) {
      originalCallback(notification);
    }, function (err) {
      Meteor._debug("Error in oplog callback", err);
    });
    var listenHandle = self._crossbar.listen(trigger, callback);
    return {
      stop: function () {
        listenHandle.stop();
      }
    };
  },
  // Register a callback to be invoked any time we skip oplog entries (eg,
  // because we are too far behind).
  onSkippedEntries: function (callback) {
    var self = this;
    if (self._stopped) throw new Error("Called onSkippedEntries on stopped handle!");
    return self._onSkippedEntriesHook.register(callback);
  },
  // Calls `callback` once the oplog has been processed up to a point that is
  // roughly "now": specifically, once we've processed all ops that are
  // currently visible.
  // XXX become convinced that this is actually safe even if oplogConnection
  // is some kind of pool
  waitUntilCaughtUp: function () {
    var self = this;
    if (self._stopped) throw new Error("Called waitUntilCaughtUp on stopped handle!");

    // Calling waitUntilCaughtUp requries us to wait for the oplog connection to
    // be ready.
    self._readyFuture.wait();
    var lastEntry;
    while (!self._stopped) {
      // We need to make the selector at least as restrictive as the actual
      // tailing selector (ie, we need to specify the DB name) or else we might
      // find a TS that won't show up in the actual tail stream.
      try {
        lastEntry = self._oplogLastEntryConnection.findOne(OPLOG_COLLECTION, self._baseOplogSelector, {
          projection: {
            ts: 1
          },
          sort: {
            $natural: -1
          }
        });
        break;
      } catch (e) {
        // During failover (eg) if we get an exception we should log and retry
        // instead of crashing.
        Meteor._debug("Got exception while reading last entry", e);
        Meteor._sleepForMs(100);
      }
    }
    if (self._stopped) return;
    if (!lastEntry) {
      // Really, nothing in the oplog? Well, we've processed everything.
      return;
    }
    var ts = lastEntry.ts;
    if (!ts) throw Error("oplog entry without ts: " + EJSON.stringify(lastEntry));
    if (self._lastProcessedTS && ts.lessThanOrEqual(self._lastProcessedTS)) {
      // We've already caught up to here.
      return;
    }

    // Insert the future into our list. Almost always, this will be at the end,
    // but it's conceivable that if we fail over from one primary to another,
    // the oplog entries we see will go backwards.
    var insertAfter = self._catchingUpFutures.length;
    while (insertAfter - 1 > 0 && self._catchingUpFutures[insertAfter - 1].ts.greaterThan(ts)) {
      insertAfter--;
    }
    var f = new Future();
    self._catchingUpFutures.splice(insertAfter, 0, {
      ts: ts,
      future: f
    });
    f.wait();
  },
  _startTailing: function () {
    var self = this;
    // First, make sure that we're talking to the local database.
    var mongodbUri = Npm.require('mongodb-uri');
    if (mongodbUri.parse(self._oplogUrl).database !== 'local') {
      throw Error("$MONGO_OPLOG_URL must be set to the 'local' database of " + "a Mongo replica set");
    }

    // We make two separate connections to Mongo. The Node Mongo driver
    // implements a naive round-robin connection pool: each "connection" is a
    // pool of several (5 by default) TCP connections, and each request is
    // rotated through the pools. Tailable cursor queries block on the server
    // until there is some data to return (or until a few seconds have
    // passed). So if the connection pool used for tailing cursors is the same
    // pool used for other queries, the other queries will be delayed by seconds
    // 1/5 of the time.
    //
    // The tail connection will only ever be running a single tail command, so
    // it only needs to make one underlying TCP connection.
    self._oplogTailConnection = new MongoConnection(self._oplogUrl, {
      maxPoolSize: 1
    });
    // XXX better docs, but: it's to get monotonic results
    // XXX is it safe to say "if there's an in flight query, just use its
    //     results"? I don't think so but should consider that
    self._oplogLastEntryConnection = new MongoConnection(self._oplogUrl, {
      maxPoolSize: 1
    });

    // Now, make sure that there actually is a repl set here. If not, oplog
    // tailing won't ever find anything!
    // More on the isMasterDoc
    // https://docs.mongodb.com/manual/reference/command/isMaster/
    var f = new Future();
    self._oplogLastEntryConnection.db.admin().command({
      ismaster: 1
    }, f.resolver());
    var isMasterDoc = f.wait();
    if (!(isMasterDoc && isMasterDoc.setName)) {
      throw Error("$MONGO_OPLOG_URL must be set to the 'local' database of " + "a Mongo replica set");
    }

    // Find the last oplog entry.
    var lastOplogEntry = self._oplogLastEntryConnection.findOne(OPLOG_COLLECTION, {}, {
      sort: {
        $natural: -1
      },
      projection: {
        ts: 1
      }
    });
    var oplogSelector = _.clone(self._baseOplogSelector);
    if (lastOplogEntry) {
      // Start after the last entry that currently exists.
      oplogSelector.ts = {
        $gt: lastOplogEntry.ts
      };
      // If there are any calls to callWhenProcessedLatest before any other
      // oplog entries show up, allow callWhenProcessedLatest to call its
      // callback immediately.
      self._lastProcessedTS = lastOplogEntry.ts;
    }
    var cursorDescription = new CursorDescription(OPLOG_COLLECTION, oplogSelector, {
      tailable: true
    });

    // Start tailing the oplog.
    //
    // We restart the low-level oplog query every 30 seconds if we didn't get a
    // doc. This is a workaround for #8598: the Node Mongo driver has at least
    // one bug that can lead to query callbacks never getting called (even with
    // an error) when leadership failover occur.
    self._tailHandle = self._oplogTailConnection.tail(cursorDescription, function (doc) {
      self._entryQueue.push(doc);
      self._maybeStartWorker();
    }, TAIL_TIMEOUT);
    self._readyFuture.return();
  },
  _maybeStartWorker: function () {
    var self = this;
    if (self._workerActive) return;
    self._workerActive = true;
    Meteor.defer(function () {
      // May be called recursively in case of transactions.
      function handleDoc(doc) {
        if (doc.ns === "admin.$cmd") {
          if (doc.o.applyOps) {
            // This was a successful transaction, so we need to apply the
            // operations that were involved.
            let nextTimestamp = doc.ts;
            doc.o.applyOps.forEach(op => {
              // See https://github.com/meteor/meteor/issues/10420.
              if (!op.ts) {
                op.ts = nextTimestamp;
                nextTimestamp = nextTimestamp.add(Long.ONE);
              }
              handleDoc(op);
            });
            return;
          }
          throw new Error("Unknown command " + EJSON.stringify(doc));
        }
        const trigger = {
          dropCollection: false,
          dropDatabase: false,
          op: doc
        };
        if (typeof doc.ns === "string" && doc.ns.startsWith(self._dbName + ".")) {
          trigger.collection = doc.ns.slice(self._dbName.length + 1);
        }

        // Is it a special command and the collection name is hidden
        // somewhere in operator?
        if (trigger.collection === "$cmd") {
          if (doc.o.dropDatabase) {
            delete trigger.collection;
            trigger.dropDatabase = true;
          } else if (_.has(doc.o, "drop")) {
            trigger.collection = doc.o.drop;
            trigger.dropCollection = true;
            trigger.id = null;
          } else if ("create" in doc.o && "idIndex" in doc.o) {
            // A collection got implicitly created within a transaction. There's
            // no need to do anything about it.
          } else {
            throw Error("Unknown command " + EJSON.stringify(doc));
          }
        } else {
          // All other ops have an id.
          trigger.id = idForOp(doc);
        }
        self._crossbar.fire(trigger);
      }
      try {
        while (!self._stopped && !self._entryQueue.isEmpty()) {
          // Are we too far behind? Just tell our observers that they need to
          // repoll, and drop our queue.
          if (self._entryQueue.length > TOO_FAR_BEHIND) {
            var lastEntry = self._entryQueue.pop();
            self._entryQueue.clear();
            self._onSkippedEntriesHook.each(function (callback) {
              callback();
              return true;
            });

            // Free any waitUntilCaughtUp() calls that were waiting for us to
            // pass something that we just skipped.
            self._setLastProcessedTS(lastEntry.ts);
            continue;
          }
          const doc = self._entryQueue.shift();

          // Fire trigger(s) for this doc.
          handleDoc(doc);

          // Now that we've processed this operation, process pending
          // sequencers.
          if (doc.ts) {
            self._setLastProcessedTS(doc.ts);
          } else {
            throw Error("oplog entry without ts: " + EJSON.stringify(doc));
          }
        }
      } finally {
        self._workerActive = false;
      }
    });
  },
  _setLastProcessedTS: function (ts) {
    var self = this;
    self._lastProcessedTS = ts;
    while (!_.isEmpty(self._catchingUpFutures) && self._catchingUpFutures[0].ts.lessThanOrEqual(self._lastProcessedTS)) {
      var sequencer = self._catchingUpFutures.shift();
      sequencer.future.return();
    }
  },
  //Methods used on tests to dinamically change TOO_FAR_BEHIND
  _defineTooFarBehind: function (value) {
    TOO_FAR_BEHIND = value;
  },
  _resetTooFarBehind: function () {
    TOO_FAR_BEHIND = process.env.METEOR_OPLOG_TOO_FAR_BEHIND || 2000;
  }
});
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"observe_multiplex.js":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/mongo/observe_multiplex.js                                                                                 //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
const _excluded = ["_id"];
let _objectWithoutProperties;
module.link("@babel/runtime/helpers/objectWithoutProperties", {
  default(v) {
    _objectWithoutProperties = v;
  }
}, 0);
var Future = Npm.require('fibers/future');
ObserveMultiplexer = function (options) {
  var self = this;
  if (!options || !_.has(options, 'ordered')) throw Error("must specified ordered");
  Package['facts-base'] && Package['facts-base'].Facts.incrementServerFact("mongo-livedata", "observe-multiplexers", 1);
  self._ordered = options.ordered;
  self._onStop = options.onStop || function () {};
  self._queue = new Meteor._SynchronousQueue();
  self._handles = {};
  self._readyFuture = new Future();
  self._cache = new LocalCollection._CachingChangeObserver({
    ordered: options.ordered
  });
  // Number of addHandleAndSendInitialAdds tasks scheduled but not yet
  // running. removeHandle uses this to know if it's time to call the onStop
  // callback.
  self._addHandleTasksScheduledButNotPerformed = 0;
  _.each(self.callbackNames(), function (callbackName) {
    self[callbackName] = function /* ... */
    () {
      self._applyCallback(callbackName, _.toArray(arguments));
    };
  });
};
_.extend(ObserveMultiplexer.prototype, {
  addHandleAndSendInitialAdds: function (handle) {
    var self = this;

    // Check this before calling runTask (even though runTask does the same
    // check) so that we don't leak an ObserveMultiplexer on error by
    // incrementing _addHandleTasksScheduledButNotPerformed and never
    // decrementing it.
    if (!self._queue.safeToRunTask()) throw new Error("Can't call observeChanges from an observe callback on the same query");
    ++self._addHandleTasksScheduledButNotPerformed;
    Package['facts-base'] && Package['facts-base'].Facts.incrementServerFact("mongo-livedata", "observe-handles", 1);
    self._queue.runTask(function () {
      self._handles[handle._id] = handle;
      // Send out whatever adds we have so far (whether or not we the
      // multiplexer is ready).
      self._sendAdds(handle);
      --self._addHandleTasksScheduledButNotPerformed;
    });
    // *outside* the task, since otherwise we'd deadlock
    self._readyFuture.wait();
  },
  // Remove an observe handle. If it was the last observe handle, call the
  // onStop callback; you cannot add any more observe handles after this.
  //
  // This is not synchronized with polls and handle additions: this means that
  // you can safely call it from within an observe callback, but it also means
  // that we have to be careful when we iterate over _handles.
  removeHandle: function (id) {
    var self = this;

    // This should not be possible: you can only call removeHandle by having
    // access to the ObserveHandle, which isn't returned to user code until the
    // multiplex is ready.
    if (!self._ready()) throw new Error("Can't remove handles until the multiplex is ready");
    delete self._handles[id];
    Package['facts-base'] && Package['facts-base'].Facts.incrementServerFact("mongo-livedata", "observe-handles", -1);
    if (_.isEmpty(self._handles) && self._addHandleTasksScheduledButNotPerformed === 0) {
      self._stop();
    }
  },
  _stop: function (options) {
    var self = this;
    options = options || {};

    // It shouldn't be possible for us to stop when all our handles still
    // haven't been returned from observeChanges!
    if (!self._ready() && !options.fromQueryError) throw Error("surprising _stop: not ready");

    // Call stop callback (which kills the underlying process which sends us
    // callbacks and removes us from the connection's dictionary).
    self._onStop();
    Package['facts-base'] && Package['facts-base'].Facts.incrementServerFact("mongo-livedata", "observe-multiplexers", -1);

    // Cause future addHandleAndSendInitialAdds calls to throw (but the onStop
    // callback should make our connection forget about us).
    self._handles = null;
  },
  // Allows all addHandleAndSendInitialAdds calls to return, once all preceding
  // adds have been processed. Does not block.
  ready: function () {
    var self = this;
    self._queue.queueTask(function () {
      if (self._ready()) throw Error("can't make ObserveMultiplex ready twice!");
      self._readyFuture.return();
    });
  },
  // If trying to execute the query results in an error, call this. This is
  // intended for permanent errors, not transient network errors that could be
  // fixed. It should only be called before ready(), because if you called ready
  // that meant that you managed to run the query once. It will stop this
  // ObserveMultiplex and cause addHandleAndSendInitialAdds calls (and thus
  // observeChanges calls) to throw the error.
  queryError: function (err) {
    var self = this;
    self._queue.runTask(function () {
      if (self._ready()) throw Error("can't claim query has an error after it worked!");
      self._stop({
        fromQueryError: true
      });
      self._readyFuture.throw(err);
    });
  },
  // Calls "cb" once the effects of all "ready", "addHandleAndSendInitialAdds"
  // and observe callbacks which came before this call have been propagated to
  // all handles. "ready" must have already been called on this multiplexer.
  onFlush: function (cb) {
    var self = this;
    self._queue.queueTask(function () {
      if (!self._ready()) throw Error("only call onFlush on a multiplexer that will be ready");
      cb();
    });
  },
  callbackNames: function () {
    var self = this;
    if (self._ordered) return ["addedBefore", "changed", "movedBefore", "removed"];else return ["added", "changed", "removed"];
  },
  _ready: function () {
    return this._readyFuture.isResolved();
  },
  _applyCallback: function (callbackName, args) {
    var self = this;
    self._queue.queueTask(function () {
      // If we stopped in the meantime, do nothing.
      if (!self._handles) return;

      // First, apply the change to the cache.
      self._cache.applyChange[callbackName].apply(null, args);

      // If we haven't finished the initial adds, then we should only be getting
      // adds.
      if (!self._ready() && callbackName !== 'added' && callbackName !== 'addedBefore') {
        throw new Error("Got " + callbackName + " during initial adds");
      }

      // Now multiplex the callbacks out to all observe handles. It's OK if
      // these calls yield; since we're inside a task, no other use of our queue
      // can continue until these are done. (But we do have to be careful to not
      // use a handle that got removed, because removeHandle does not use the
      // queue; thus, we iterate over an array of keys that we control.)
      _.each(_.keys(self._handles), function (handleId) {
        var handle = self._handles && self._handles[handleId];
        if (!handle) return;
        var callback = handle['_' + callbackName];
        // clone arguments so that callbacks can mutate their arguments
        callback && callback.apply(null, handle.nonMutatingCallbacks ? args : EJSON.clone(args));
      });
    });
  },
  // Sends initial adds to a handle. It should only be called from within a task
  // (the task that is processing the addHandleAndSendInitialAdds call). It
  // synchronously invokes the handle's added or addedBefore; there's no need to
  // flush the queue afterwards to ensure that the callbacks get out.
  _sendAdds: function (handle) {
    var self = this;
    if (self._queue.safeToRunTask()) throw Error("_sendAdds may only be called from within a task!");
    var add = self._ordered ? handle._addedBefore : handle._added;
    if (!add) return;
    // note: docs may be an _IdMap or an OrderedDict
    self._cache.docs.forEach(function (doc, id) {
      if (!_.has(self._handles, handle._id)) throw Error("handle got removed before sending initial adds!");
      const _ref = handle.nonMutatingCallbacks ? doc : EJSON.clone(doc),
        {
          _id
        } = _ref,
        fields = _objectWithoutProperties(_ref, _excluded);
      if (self._ordered) add(id, fields, null); // we're going in order, so add at end
      else add(id, fields);
    });
  }
});
var nextObserveHandleId = 1;

// When the callbacks do not mutate the arguments, we can skip a lot of data clones
ObserveHandle = function (multiplexer, callbacks) {
  let nonMutatingCallbacks = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : false;
  var self = this;
  // The end user is only supposed to call stop().  The other fields are
  // accessible to the multiplexer, though.
  self._multiplexer = multiplexer;
  _.each(multiplexer.callbackNames(), function (name) {
    if (callbacks[name]) {
      self['_' + name] = callbacks[name];
    } else if (name === "addedBefore" && callbacks.added) {
      // Special case: if you specify "added" and "movedBefore", you get an
      // ordered observe where for some reason you don't get ordering data on
      // the adds.  I dunno, we wrote tests for it, there must have been a
      // reason.
      self._addedBefore = function (id, fields, before) {
        callbacks.added(id, fields);
      };
    }
  });
  self._stopped = false;
  self._id = nextObserveHandleId++;
  self.nonMutatingCallbacks = nonMutatingCallbacks;
};
ObserveHandle.prototype.stop = function () {
  var self = this;
  if (self._stopped) return;
  self._stopped = true;
  self._multiplexer.removeHandle(self._id);
};
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"doc_fetcher.js":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/mongo/doc_fetcher.js                                                                                       //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
module.export({
  DocFetcher: () => DocFetcher
});
var Fiber = Npm.require('fibers');
class DocFetcher {
  constructor(mongoConnection) {
    this._mongoConnection = mongoConnection;
    // Map from op -> [callback]
    this._callbacksForOp = new Map();
  }

  // Fetches document "id" from collectionName, returning it or null if not
  // found.
  //
  // If you make multiple calls to fetch() with the same op reference,
  // DocFetcher may assume that they all return the same document. (It does
  // not check to see if collectionName/id match.)
  //
  // You may assume that callback is never called synchronously (and in fact
  // OplogObserveDriver does so).
  fetch(collectionName, id, op, callback) {
    const self = this;
    check(collectionName, String);
    check(op, Object);

    // If there's already an in-progress fetch for this cache key, yield until
    // it's done and return whatever it returns.
    if (self._callbacksForOp.has(op)) {
      self._callbacksForOp.get(op).push(callback);
      return;
    }
    const callbacks = [callback];
    self._callbacksForOp.set(op, callbacks);
    Fiber(function () {
      try {
        var doc = self._mongoConnection.findOne(collectionName, {
          _id: id
        }) || null;
        // Return doc to all relevant callbacks. Note that this array can
        // continue to grow during callback excecution.
        while (callbacks.length > 0) {
          // Clone the document so that the various calls to fetch don't return
          // objects that are intertwingled with each other. Clone before
          // popping the future, so that if clone throws, the error gets passed
          // to the next callback.
          callbacks.pop()(null, EJSON.clone(doc));
        }
      } catch (e) {
        while (callbacks.length > 0) {
          callbacks.pop()(e);
        }
      } finally {
        // XXX consider keeping the doc around for a period of time before
        // removing from the cache
        self._callbacksForOp.delete(op);
      }
    }).run();
  }
}
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"polling_observe_driver.js":function module(){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/mongo/polling_observe_driver.js                                                                            //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
var POLLING_THROTTLE_MS = +process.env.METEOR_POLLING_THROTTLE_MS || 50;
var POLLING_INTERVAL_MS = +process.env.METEOR_POLLING_INTERVAL_MS || 10 * 1000;
PollingObserveDriver = function (options) {
  var self = this;
  self._cursorDescription = options.cursorDescription;
  self._mongoHandle = options.mongoHandle;
  self._ordered = options.ordered;
  self._multiplexer = options.multiplexer;
  self._stopCallbacks = [];
  self._stopped = false;
  self._synchronousCursor = self._mongoHandle._createSynchronousCursor(self._cursorDescription);

  // previous results snapshot.  on each poll cycle, diffs against
  // results drives the callbacks.
  self._results = null;

  // The number of _pollMongo calls that have been added to self._taskQueue but
  // have not started running. Used to make sure we never schedule more than one
  // _pollMongo (other than possibly the one that is currently running). It's
  // also used by _suspendPolling to pretend there's a poll scheduled. Usually,
  // it's either 0 (for "no polls scheduled other than maybe one currently
  // running") or 1 (for "a poll scheduled that isn't running yet"), but it can
  // also be 2 if incremented by _suspendPolling.
  self._pollsScheduledButNotStarted = 0;
  self._pendingWrites = []; // people to notify when polling completes

  // Make sure to create a separately throttled function for each
  // PollingObserveDriver object.
  self._ensurePollIsScheduled = _.throttle(self._unthrottledEnsurePollIsScheduled, self._cursorDescription.options.pollingThrottleMs || POLLING_THROTTLE_MS /* ms */);

  // XXX figure out if we still need a queue
  self._taskQueue = new Meteor._SynchronousQueue();
  var listenersHandle = listenAll(self._cursorDescription, function (notification) {
    // When someone does a transaction that might affect us, schedule a poll
    // of the database. If that transaction happens inside of a write fence,
    // block the fence until we've polled and notified observers.
    var fence = DDPServer._CurrentWriteFence.get();
    if (fence) self._pendingWrites.push(fence.beginWrite());
    // Ensure a poll is scheduled... but if we already know that one is,
    // don't hit the throttled _ensurePollIsScheduled function (which might
    // lead to us calling it unnecessarily in <pollingThrottleMs> ms).
    if (self._pollsScheduledButNotStarted === 0) self._ensurePollIsScheduled();
  });
  self._stopCallbacks.push(function () {
    listenersHandle.stop();
  });

  // every once and a while, poll even if we don't think we're dirty, for
  // eventual consistency with database writes from outside the Meteor
  // universe.
  //
  // For testing, there's an undocumented callback argument to observeChanges
  // which disables time-based polling and gets called at the beginning of each
  // poll.
  if (options._testOnlyPollCallback) {
    self._testOnlyPollCallback = options._testOnlyPollCallback;
  } else {
    var pollingInterval = self._cursorDescription.options.pollingIntervalMs || self._cursorDescription.options._pollingInterval ||
    // COMPAT with 1.2
    POLLING_INTERVAL_MS;
    var intervalHandle = Meteor.setInterval(_.bind(self._ensurePollIsScheduled, self), pollingInterval);
    self._stopCallbacks.push(function () {
      Meteor.clearInterval(intervalHandle);
    });
  }

  // Make sure we actually poll soon!
  self._unthrottledEnsurePollIsScheduled();
  Package['facts-base'] && Package['facts-base'].Facts.incrementServerFact("mongo-livedata", "observe-drivers-polling", 1);
};
_.extend(PollingObserveDriver.prototype, {
  // This is always called through _.throttle (except once at startup).
  _unthrottledEnsurePollIsScheduled: function () {
    var self = this;
    if (self._pollsScheduledButNotStarted > 0) return;
    ++self._pollsScheduledButNotStarted;
    self._taskQueue.queueTask(function () {
      self._pollMongo();
    });
  },
  // test-only interface for controlling polling.
  //
  // _suspendPolling blocks until any currently running and scheduled polls are
  // done, and prevents any further polls from being scheduled. (new
  // ObserveHandles can be added and receive their initial added callbacks,
  // though.)
  //
  // _resumePolling immediately polls, and allows further polls to occur.
  _suspendPolling: function () {
    var self = this;
    // Pretend that there's another poll scheduled (which will prevent
    // _ensurePollIsScheduled from queueing any more polls).
    ++self._pollsScheduledButNotStarted;
    // Now block until all currently running or scheduled polls are done.
    self._taskQueue.runTask(function () {});

    // Confirm that there is only one "poll" (the fake one we're pretending to
    // have) scheduled.
    if (self._pollsScheduledButNotStarted !== 1) throw new Error("_pollsScheduledButNotStarted is " + self._pollsScheduledButNotStarted);
  },
  _resumePolling: function () {
    var self = this;
    // We should be in the same state as in the end of _suspendPolling.
    if (self._pollsScheduledButNotStarted !== 1) throw new Error("_pollsScheduledButNotStarted is " + self._pollsScheduledButNotStarted);
    // Run a poll synchronously (which will counteract the
    // ++_pollsScheduledButNotStarted from _suspendPolling).
    self._taskQueue.runTask(function () {
      self._pollMongo();
    });
  },
  _pollMongo: function () {
    var self = this;
    --self._pollsScheduledButNotStarted;
    if (self._stopped) return;
    var first = false;
    var newResults;
    var oldResults = self._results;
    if (!oldResults) {
      first = true;
      // XXX maybe use OrderedDict instead?
      oldResults = self._ordered ? [] : new LocalCollection._IdMap();
    }
    self._testOnlyPollCallback && self._testOnlyPollCallback();

    // Save the list of pending writes which this round will commit.
    var writesForCycle = self._pendingWrites;
    self._pendingWrites = [];

    // Get the new query results. (This yields.)
    try {
      newResults = self._synchronousCursor.getRawObjects(self._ordered);
    } catch (e) {
      if (first && typeof e.code === 'number') {
        // This is an error document sent to us by mongod, not a connection
        // error generated by the client. And we've never seen this query work
        // successfully. Probably it's a bad selector or something, so we should
        // NOT retry. Instead, we should halt the observe (which ends up calling
        // `stop` on us).
        self._multiplexer.queryError(new Error("Exception while polling query " + JSON.stringify(self._cursorDescription) + ": " + e.message));
        return;
      }

      // getRawObjects can throw if we're having trouble talking to the
      // database.  That's fine --- we will repoll later anyway. But we should
      // make sure not to lose track of this cycle's writes.
      // (It also can throw if there's just something invalid about this query;
      // unfortunately the ObserveDriver API doesn't provide a good way to
      // "cancel" the observe from the inside in this case.
      Array.prototype.push.apply(self._pendingWrites, writesForCycle);
      Meteor._debug("Exception while polling query " + JSON.stringify(self._cursorDescription), e);
      return;
    }

    // Run diffs.
    if (!self._stopped) {
      LocalCollection._diffQueryChanges(self._ordered, oldResults, newResults, self._multiplexer);
    }

    // Signals the multiplexer to allow all observeChanges calls that share this
    // multiplexer to return. (This happens asynchronously, via the
    // multiplexer's queue.)
    if (first) self._multiplexer.ready();

    // Replace self._results atomically.  (This assignment is what makes `first`
    // stay through on the next cycle, so we've waited until after we've
    // committed to ready-ing the multiplexer.)
    self._results = newResults;

    // Once the ObserveMultiplexer has processed everything we've done in this
    // round, mark all the writes which existed before this call as
    // commmitted. (If new writes have shown up in the meantime, there'll
    // already be another _pollMongo task scheduled.)
    self._multiplexer.onFlush(function () {
      _.each(writesForCycle, function (w) {
        w.committed();
      });
    });
  },
  stop: function () {
    var self = this;
    self._stopped = true;
    _.each(self._stopCallbacks, function (c) {
      c();
    });
    // Release any write fences that are waiting on us.
    _.each(self._pendingWrites, function (w) {
      w.committed();
    });
    Package['facts-base'] && Package['facts-base'].Facts.incrementServerFact("mongo-livedata", "observe-drivers-polling", -1);
  }
});
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"oplog_observe_driver.js":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/mongo/oplog_observe_driver.js                                                                              //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
let oplogV2V1Converter;
module.link("./oplog_v2_converter", {
  oplogV2V1Converter(v) {
    oplogV2V1Converter = v;
  }
}, 0);
var Future = Npm.require('fibers/future');
var PHASE = {
  QUERYING: "QUERYING",
  FETCHING: "FETCHING",
  STEADY: "STEADY"
};

// Exception thrown by _needToPollQuery which unrolls the stack up to the
// enclosing call to finishIfNeedToPollQuery.
var SwitchedToQuery = function () {};
var finishIfNeedToPollQuery = function (f) {
  return function () {
    try {
      f.apply(this, arguments);
    } catch (e) {
      if (!(e instanceof SwitchedToQuery)) throw e;
    }
  };
};
var currentId = 0;

// OplogObserveDriver is an alternative to PollingObserveDriver which follows
// the Mongo operation log instead of just re-polling the query. It obeys the
// same simple interface: constructing it starts sending observeChanges
// callbacks (and a ready() invocation) to the ObserveMultiplexer, and you stop
// it by calling the stop() method.
OplogObserveDriver = function (options) {
  var self = this;
  self._usesOplog = true; // tests look at this

  self._id = currentId;
  currentId++;
  self._cursorDescription = options.cursorDescription;
  self._mongoHandle = options.mongoHandle;
  self._multiplexer = options.multiplexer;
  if (options.ordered) {
    throw Error("OplogObserveDriver only supports unordered observeChanges");
  }
  var sorter = options.sorter;
  // We don't support $near and other geo-queries so it's OK to initialize the
  // comparator only once in the constructor.
  var comparator = sorter && sorter.getComparator();
  if (options.cursorDescription.options.limit) {
    // There are several properties ordered driver implements:
    // - _limit is a positive number
    // - _comparator is a function-comparator by which the query is ordered
    // - _unpublishedBuffer is non-null Min/Max Heap,
    //                      the empty buffer in STEADY phase implies that the
    //                      everything that matches the queries selector fits
    //                      into published set.
    // - _published - Max Heap (also implements IdMap methods)

    var heapOptions = {
      IdMap: LocalCollection._IdMap
    };
    self._limit = self._cursorDescription.options.limit;
    self._comparator = comparator;
    self._sorter = sorter;
    self._unpublishedBuffer = new MinMaxHeap(comparator, heapOptions);
    // We need something that can find Max value in addition to IdMap interface
    self._published = new MaxHeap(comparator, heapOptions);
  } else {
    self._limit = 0;
    self._comparator = null;
    self._sorter = null;
    self._unpublishedBuffer = null;
    self._published = new LocalCollection._IdMap();
  }

  // Indicates if it is safe to insert a new document at the end of the buffer
  // for this query. i.e. it is known that there are no documents matching the
  // selector those are not in published or buffer.
  self._safeAppendToBuffer = false;
  self._stopped = false;
  self._stopHandles = [];
  Package['facts-base'] && Package['facts-base'].Facts.incrementServerFact("mongo-livedata", "observe-drivers-oplog", 1);
  self._registerPhaseChange(PHASE.QUERYING);
  self._matcher = options.matcher;
  // we are now using projection, not fields in the cursor description even if you pass {fields}
  // in the cursor construction
  var projection = self._cursorDescription.options.fields || self._cursorDescription.options.projection || {};
  self._projectionFn = LocalCollection._compileProjection(projection);
  // Projection function, result of combining important fields for selector and
  // existing fields projection
  self._sharedProjection = self._matcher.combineIntoProjection(projection);
  if (sorter) self._sharedProjection = sorter.combineIntoProjection(self._sharedProjection);
  self._sharedProjectionFn = LocalCollection._compileProjection(self._sharedProjection);
  self._needToFetch = new LocalCollection._IdMap();
  self._currentlyFetching = null;
  self._fetchGeneration = 0;
  self._requeryWhenDoneThisQuery = false;
  self._writesToCommitWhenWeReachSteady = [];

  // If the oplog handle tells us that it skipped some entries (because it got
  // behind, say), re-poll.
  self._stopHandles.push(self._mongoHandle._oplogHandle.onSkippedEntries(finishIfNeedToPollQuery(function () {
    self._needToPollQuery();
  })));
  forEachTrigger(self._cursorDescription, function (trigger) {
    self._stopHandles.push(self._mongoHandle._oplogHandle.onOplogEntry(trigger, function (notification) {
      Meteor._noYieldsAllowed(finishIfNeedToPollQuery(function () {
        var op = notification.op;
        if (notification.dropCollection || notification.dropDatabase) {
          // Note: this call is not allowed to block on anything (especially
          // on waiting for oplog entries to catch up) because that will block
          // onOplogEntry!
          self._needToPollQuery();
        } else {
          // All other operators should be handled depending on phase
          if (self._phase === PHASE.QUERYING) {
            self._handleOplogEntryQuerying(op);
          } else {
            self._handleOplogEntrySteadyOrFetching(op);
          }
        }
      }));
    }));
  });

  // XXX ordering w.r.t. everything else?
  self._stopHandles.push(listenAll(self._cursorDescription, function (notification) {
    // If we're not in a pre-fire write fence, we don't have to do anything.
    var fence = DDPServer._CurrentWriteFence.get();
    if (!fence || fence.fired) return;
    if (fence._oplogObserveDrivers) {
      fence._oplogObserveDrivers[self._id] = self;
      return;
    }
    fence._oplogObserveDrivers = {};
    fence._oplogObserveDrivers[self._id] = self;
    fence.onBeforeFire(function () {
      var drivers = fence._oplogObserveDrivers;
      delete fence._oplogObserveDrivers;

      // This fence cannot fire until we've caught up to "this point" in the
      // oplog, and all observers made it back to the steady state.
      self._mongoHandle._oplogHandle.waitUntilCaughtUp();
      _.each(drivers, function (driver) {
        if (driver._stopped) return;
        var write = fence.beginWrite();
        if (driver._phase === PHASE.STEADY) {
          // Make sure that all of the callbacks have made it through the
          // multiplexer and been delivered to ObserveHandles before committing
          // writes.
          driver._multiplexer.onFlush(function () {
            write.committed();
          });
        } else {
          driver._writesToCommitWhenWeReachSteady.push(write);
        }
      });
    });
  }));

  // When Mongo fails over, we need to repoll the query, in case we processed an
  // oplog entry that got rolled back.
  self._stopHandles.push(self._mongoHandle._onFailover(finishIfNeedToPollQuery(function () {
    self._needToPollQuery();
  })));

  // Give _observeChanges a chance to add the new ObserveHandle to our
  // multiplexer, so that the added calls get streamed.
  Meteor.defer(finishIfNeedToPollQuery(function () {
    self._runInitialQuery();
  }));
};
_.extend(OplogObserveDriver.prototype, {
  _addPublished: function (id, doc) {
    var self = this;
    Meteor._noYieldsAllowed(function () {
      var fields = _.clone(doc);
      delete fields._id;
      self._published.set(id, self._sharedProjectionFn(doc));
      self._multiplexer.added(id, self._projectionFn(fields));

      // After adding this document, the published set might be overflowed
      // (exceeding capacity specified by limit). If so, push the maximum
      // element to the buffer, we might want to save it in memory to reduce the
      // amount of Mongo lookups in the future.
      if (self._limit && self._published.size() > self._limit) {
        // XXX in theory the size of published is no more than limit+1
        if (self._published.size() !== self._limit + 1) {
          throw new Error("After adding to published, " + (self._published.size() - self._limit) + " documents are overflowing the set");
        }
        var overflowingDocId = self._published.maxElementId();
        var overflowingDoc = self._published.get(overflowingDocId);
        if (EJSON.equals(overflowingDocId, id)) {
          throw new Error("The document just added is overflowing the published set");
        }
        self._published.remove(overflowingDocId);
        self._multiplexer.removed(overflowingDocId);
        self._addBuffered(overflowingDocId, overflowingDoc);
      }
    });
  },
  _removePublished: function (id) {
    var self = this;
    Meteor._noYieldsAllowed(function () {
      self._published.remove(id);
      self._multiplexer.removed(id);
      if (!self._limit || self._published.size() === self._limit) return;
      if (self._published.size() > self._limit) throw Error("self._published got too big");

      // OK, we are publishing less than the limit. Maybe we should look in the
      // buffer to find the next element past what we were publishing before.

      if (!self._unpublishedBuffer.empty()) {
        // There's something in the buffer; move the first thing in it to
        // _published.
        var newDocId = self._unpublishedBuffer.minElementId();
        var newDoc = self._unpublishedBuffer.get(newDocId);
        self._removeBuffered(newDocId);
        self._addPublished(newDocId, newDoc);
        return;
      }

      // There's nothing in the buffer.  This could mean one of a few things.

      // (a) We could be in the middle of re-running the query (specifically, we
      // could be in _publishNewResults). In that case, _unpublishedBuffer is
      // empty because we clear it at the beginning of _publishNewResults. In
      // this case, our caller already knows the entire answer to the query and
      // we don't need to do anything fancy here.  Just return.
      if (self._phase === PHASE.QUERYING) return;

      // (b) We're pretty confident that the union of _published and
      // _unpublishedBuffer contain all documents that match selector. Because
      // _unpublishedBuffer is empty, that means we're confident that _published
      // contains all documents that match selector. So we have nothing to do.
      if (self._safeAppendToBuffer) return;

      // (c) Maybe there are other documents out there that should be in our
      // buffer. But in that case, when we emptied _unpublishedBuffer in
      // _removeBuffered, we should have called _needToPollQuery, which will
      // either put something in _unpublishedBuffer or set _safeAppendToBuffer
      // (or both), and it will put us in QUERYING for that whole time. So in
      // fact, we shouldn't be able to get here.

      throw new Error("Buffer inexplicably empty");
    });
  },
  _changePublished: function (id, oldDoc, newDoc) {
    var self = this;
    Meteor._noYieldsAllowed(function () {
      self._published.set(id, self._sharedProjectionFn(newDoc));
      var projectedNew = self._projectionFn(newDoc);
      var projectedOld = self._projectionFn(oldDoc);
      var changed = DiffSequence.makeChangedFields(projectedNew, projectedOld);
      if (!_.isEmpty(changed)) self._multiplexer.changed(id, changed);
    });
  },
  _addBuffered: function (id, doc) {
    var self = this;
    Meteor._noYieldsAllowed(function () {
      self._unpublishedBuffer.set(id, self._sharedProjectionFn(doc));

      // If something is overflowing the buffer, we just remove it from cache
      if (self._unpublishedBuffer.size() > self._limit) {
        var maxBufferedId = self._unpublishedBuffer.maxElementId();
        self._unpublishedBuffer.remove(maxBufferedId);

        // Since something matching is removed from cache (both published set and
        // buffer), set flag to false
        self._safeAppendToBuffer = false;
      }
    });
  },
  // Is called either to remove the doc completely from matching set or to move
  // it to the published set later.
  _removeBuffered: function (id) {
    var self = this;
    Meteor._noYieldsAllowed(function () {
      self._unpublishedBuffer.remove(id);
      // To keep the contract "buffer is never empty in STEADY phase unless the
      // everything matching fits into published" true, we poll everything as
      // soon as we see the buffer becoming empty.
      if (!self._unpublishedBuffer.size() && !self._safeAppendToBuffer) self._needToPollQuery();
    });
  },
  // Called when a document has joined the "Matching" results set.
  // Takes responsibility of keeping _unpublishedBuffer in sync with _published
  // and the effect of limit enforced.
  _addMatching: function (doc) {
    var self = this;
    Meteor._noYieldsAllowed(function () {
      var id = doc._id;
      if (self._published.has(id)) throw Error("tried to add something already published " + id);
      if (self._limit && self._unpublishedBuffer.has(id)) throw Error("tried to add something already existed in buffer " + id);
      var limit = self._limit;
      var comparator = self._comparator;
      var maxPublished = limit && self._published.size() > 0 ? self._published.get(self._published.maxElementId()) : null;
      var maxBuffered = limit && self._unpublishedBuffer.size() > 0 ? self._unpublishedBuffer.get(self._unpublishedBuffer.maxElementId()) : null;
      // The query is unlimited or didn't publish enough documents yet or the
      // new document would fit into published set pushing the maximum element
      // out, then we need to publish the doc.
      var toPublish = !limit || self._published.size() < limit || comparator(doc, maxPublished) < 0;

      // Otherwise we might need to buffer it (only in case of limited query).
      // Buffering is allowed if the buffer is not filled up yet and all
      // matching docs are either in the published set or in the buffer.
      var canAppendToBuffer = !toPublish && self._safeAppendToBuffer && self._unpublishedBuffer.size() < limit;

      // Or if it is small enough to be safely inserted to the middle or the
      // beginning of the buffer.
      var canInsertIntoBuffer = !toPublish && maxBuffered && comparator(doc, maxBuffered) <= 0;
      var toBuffer = canAppendToBuffer || canInsertIntoBuffer;
      if (toPublish) {
        self._addPublished(id, doc);
      } else if (toBuffer) {
        self._addBuffered(id, doc);
      } else {
        // dropping it and not saving to the cache
        self._safeAppendToBuffer = false;
      }
    });
  },
  // Called when a document leaves the "Matching" results set.
  // Takes responsibility of keeping _unpublishedBuffer in sync with _published
  // and the effect of limit enforced.
  _removeMatching: function (id) {
    var self = this;
    Meteor._noYieldsAllowed(function () {
      if (!self._published.has(id) && !self._limit) throw Error("tried to remove something matching but not cached " + id);
      if (self._published.has(id)) {
        self._removePublished(id);
      } else if (self._unpublishedBuffer.has(id)) {
        self._removeBuffered(id);
      }
    });
  },
  _handleDoc: function (id, newDoc) {
    var self = this;
    Meteor._noYieldsAllowed(function () {
      var matchesNow = newDoc && self._matcher.documentMatches(newDoc).result;
      var publishedBefore = self._published.has(id);
      var bufferedBefore = self._limit && self._unpublishedBuffer.has(id);
      var cachedBefore = publishedBefore || bufferedBefore;
      if (matchesNow && !cachedBefore) {
        self._addMatching(newDoc);
      } else if (cachedBefore && !matchesNow) {
        self._removeMatching(id);
      } else if (cachedBefore && matchesNow) {
        var oldDoc = self._published.get(id);
        var comparator = self._comparator;
        var minBuffered = self._limit && self._unpublishedBuffer.size() && self._unpublishedBuffer.get(self._unpublishedBuffer.minElementId());
        var maxBuffered;
        if (publishedBefore) {
          // Unlimited case where the document stays in published once it
          // matches or the case when we don't have enough matching docs to
          // publish or the changed but matching doc will stay in published
          // anyways.
          //
          // XXX: We rely on the emptiness of buffer. Be sure to maintain the
          // fact that buffer can't be empty if there are matching documents not
          // published. Notably, we don't want to schedule repoll and continue
          // relying on this property.
          var staysInPublished = !self._limit || self._unpublishedBuffer.size() === 0 || comparator(newDoc, minBuffered) <= 0;
          if (staysInPublished) {
            self._changePublished(id, oldDoc, newDoc);
          } else {
            // after the change doc doesn't stay in the published, remove it
            self._removePublished(id);
            // but it can move into buffered now, check it
            maxBuffered = self._unpublishedBuffer.get(self._unpublishedBuffer.maxElementId());
            var toBuffer = self._safeAppendToBuffer || maxBuffered && comparator(newDoc, maxBuffered) <= 0;
            if (toBuffer) {
              self._addBuffered(id, newDoc);
            } else {
              // Throw away from both published set and buffer
              self._safeAppendToBuffer = false;
            }
          }
        } else if (bufferedBefore) {
          oldDoc = self._unpublishedBuffer.get(id);
          // remove the old version manually instead of using _removeBuffered so
          // we don't trigger the querying immediately.  if we end this block
          // with the buffer empty, we will need to trigger the query poll
          // manually too.
          self._unpublishedBuffer.remove(id);
          var maxPublished = self._published.get(self._published.maxElementId());
          maxBuffered = self._unpublishedBuffer.size() && self._unpublishedBuffer.get(self._unpublishedBuffer.maxElementId());

          // the buffered doc was updated, it could move to published
          var toPublish = comparator(newDoc, maxPublished) < 0;

          // or stays in buffer even after the change
          var staysInBuffer = !toPublish && self._safeAppendToBuffer || !toPublish && maxBuffered && comparator(newDoc, maxBuffered) <= 0;
          if (toPublish) {
            self._addPublished(id, newDoc);
          } else if (staysInBuffer) {
            // stays in buffer but changes
            self._unpublishedBuffer.set(id, newDoc);
          } else {
            // Throw away from both published set and buffer
            self._safeAppendToBuffer = false;
            // Normally this check would have been done in _removeBuffered but
            // we didn't use it, so we need to do it ourself now.
            if (!self._unpublishedBuffer.size()) {
              self._needToPollQuery();
            }
          }
        } else {
          throw new Error("cachedBefore implies either of publishedBefore or bufferedBefore is true.");
        }
      }
    });
  },
  _fetchModifiedDocuments: function () {
    var self = this;
    Meteor._noYieldsAllowed(function () {
      self._registerPhaseChange(PHASE.FETCHING);
      // Defer, because nothing called from the oplog entry handler may yield,
      // but fetch() yields.
      Meteor.defer(finishIfNeedToPollQuery(function () {
        while (!self._stopped && !self._needToFetch.empty()) {
          if (self._phase === PHASE.QUERYING) {
            // While fetching, we decided to go into QUERYING mode, and then we
            // saw another oplog entry, so _needToFetch is not empty. But we
            // shouldn't fetch these documents until AFTER the query is done.
            break;
          }

          // Being in steady phase here would be surprising.
          if (self._phase !== PHASE.FETCHING) throw new Error("phase in fetchModifiedDocuments: " + self._phase);
          self._currentlyFetching = self._needToFetch;
          var thisGeneration = ++self._fetchGeneration;
          self._needToFetch = new LocalCollection._IdMap();
          var waiting = 0;
          var fut = new Future();
          // This loop is safe, because _currentlyFetching will not be updated
          // during this loop (in fact, it is never mutated).
          self._currentlyFetching.forEach(function (op, id) {
            waiting++;
            self._mongoHandle._docFetcher.fetch(self._cursorDescription.collectionName, id, op, finishIfNeedToPollQuery(function (err, doc) {
              try {
                if (err) {
                  Meteor._debug("Got exception while fetching documents", err);
                  // If we get an error from the fetcher (eg, trouble
                  // connecting to Mongo), let's just abandon the fetch phase
                  // altogether and fall back to polling. It's not like we're
                  // getting live updates anyway.
                  if (self._phase !== PHASE.QUERYING) {
                    self._needToPollQuery();
                  }
                } else if (!self._stopped && self._phase === PHASE.FETCHING && self._fetchGeneration === thisGeneration) {
                  // We re-check the generation in case we've had an explicit
                  // _pollQuery call (eg, in another fiber) which should
                  // effectively cancel this round of fetches.  (_pollQuery
                  // increments the generation.)
                  self._handleDoc(id, doc);
                }
              } finally {
                waiting--;
                // Because fetch() never calls its callback synchronously,
                // this is safe (ie, we won't call fut.return() before the
                // forEach is done).
                if (waiting === 0) fut.return();
              }
            }));
          });
          fut.wait();
          // Exit now if we've had a _pollQuery call (here or in another fiber).
          if (self._phase === PHASE.QUERYING) return;
          self._currentlyFetching = null;
        }
        // We're done fetching, so we can be steady, unless we've had a
        // _pollQuery call (here or in another fiber).
        if (self._phase !== PHASE.QUERYING) self._beSteady();
      }));
    });
  },
  _beSteady: function () {
    var self = this;
    Meteor._noYieldsAllowed(function () {
      self._registerPhaseChange(PHASE.STEADY);
      var writes = self._writesToCommitWhenWeReachSteady;
      self._writesToCommitWhenWeReachSteady = [];
      self._multiplexer.onFlush(function () {
        _.each(writes, function (w) {
          w.committed();
        });
      });
    });
  },
  _handleOplogEntryQuerying: function (op) {
    var self = this;
    Meteor._noYieldsAllowed(function () {
      self._needToFetch.set(idForOp(op), op);
    });
  },
  _handleOplogEntrySteadyOrFetching: function (op) {
    var self = this;
    Meteor._noYieldsAllowed(function () {
      var id = idForOp(op);
      // If we're already fetching this one, or about to, we can't optimize;
      // make sure that we fetch it again if necessary.
      if (self._phase === PHASE.FETCHING && (self._currentlyFetching && self._currentlyFetching.has(id) || self._needToFetch.has(id))) {
        self._needToFetch.set(id, op);
        return;
      }
      if (op.op === 'd') {
        if (self._published.has(id) || self._limit && self._unpublishedBuffer.has(id)) self._removeMatching(id);
      } else if (op.op === 'i') {
        if (self._published.has(id)) throw new Error("insert found for already-existing ID in published");
        if (self._unpublishedBuffer && self._unpublishedBuffer.has(id)) throw new Error("insert found for already-existing ID in buffer");

        // XXX what if selector yields?  for now it can't but later it could
        // have $where
        if (self._matcher.documentMatches(op.o).result) self._addMatching(op.o);
      } else if (op.op === 'u') {
        // we are mapping the new oplog format on mongo 5
        // to what we know better, $set
        op.o = oplogV2V1Converter(op.o);
        // Is this a modifier ($set/$unset, which may require us to poll the
        // database to figure out if the whole document matches the selector) or
        // a replacement (in which case we can just directly re-evaluate the
        // selector)?
        // oplog format has changed on mongodb 5, we have to support both now
        // diff is the format in Mongo 5+ (oplog v2)
        var isReplace = !_.has(op.o, '$set') && !_.has(op.o, 'diff') && !_.has(op.o, '$unset');
        // If this modifier modifies something inside an EJSON custom type (ie,
        // anything with EJSON$), then we can't try to use
        // LocalCollection._modify, since that just mutates the EJSON encoding,
        // not the actual object.
        var canDirectlyModifyDoc = !isReplace && modifierCanBeDirectlyApplied(op.o);
        var publishedBefore = self._published.has(id);
        var bufferedBefore = self._limit && self._unpublishedBuffer.has(id);
        if (isReplace) {
          self._handleDoc(id, _.extend({
            _id: id
          }, op.o));
        } else if ((publishedBefore || bufferedBefore) && canDirectlyModifyDoc) {
          // Oh great, we actually know what the document is, so we can apply
          // this directly.
          var newDoc = self._published.has(id) ? self._published.get(id) : self._unpublishedBuffer.get(id);
          newDoc = EJSON.clone(newDoc);
          newDoc._id = id;
          try {
            LocalCollection._modify(newDoc, op.o);
          } catch (e) {
            if (e.name !== "MinimongoError") throw e;
            // We didn't understand the modifier.  Re-fetch.
            self._needToFetch.set(id, op);
            if (self._phase === PHASE.STEADY) {
              self._fetchModifiedDocuments();
            }
            return;
          }
          self._handleDoc(id, self._sharedProjectionFn(newDoc));
        } else if (!canDirectlyModifyDoc || self._matcher.canBecomeTrueByModifier(op.o) || self._sorter && self._sorter.affectedByModifier(op.o)) {
          self._needToFetch.set(id, op);
          if (self._phase === PHASE.STEADY) self._fetchModifiedDocuments();
        }
      } else {
        throw Error("XXX SURPRISING OPERATION: " + op);
      }
    });
  },
  // Yields!
  _runInitialQuery: function () {
    var self = this;
    if (self._stopped) throw new Error("oplog stopped surprisingly early");
    self._runQuery({
      initial: true
    }); // yields

    if (self._stopped) return; // can happen on queryError

    // Allow observeChanges calls to return. (After this, it's possible for
    // stop() to be called.)
    self._multiplexer.ready();
    self._doneQuerying(); // yields
  },

  // In various circumstances, we may just want to stop processing the oplog and
  // re-run the initial query, just as if we were a PollingObserveDriver.
  //
  // This function may not block, because it is called from an oplog entry
  // handler.
  //
  // XXX We should call this when we detect that we've been in FETCHING for "too
  // long".
  //
  // XXX We should call this when we detect Mongo failover (since that might
  // mean that some of the oplog entries we have processed have been rolled
  // back). The Node Mongo driver is in the middle of a bunch of huge
  // refactorings, including the way that it notifies you when primary
  // changes. Will put off implementing this until driver 1.4 is out.
  _pollQuery: function () {
    var self = this;
    Meteor._noYieldsAllowed(function () {
      if (self._stopped) return;

      // Yay, we get to forget about all the things we thought we had to fetch.
      self._needToFetch = new LocalCollection._IdMap();
      self._currentlyFetching = null;
      ++self._fetchGeneration; // ignore any in-flight fetches
      self._registerPhaseChange(PHASE.QUERYING);

      // Defer so that we don't yield.  We don't need finishIfNeedToPollQuery
      // here because SwitchedToQuery is not thrown in QUERYING mode.
      Meteor.defer(function () {
        self._runQuery();
        self._doneQuerying();
      });
    });
  },
  // Yields!
  _runQuery: function (options) {
    var self = this;
    options = options || {};
    var newResults, newBuffer;

    // This while loop is just to retry failures.
    while (true) {
      // If we've been stopped, we don't have to run anything any more.
      if (self._stopped) return;
      newResults = new LocalCollection._IdMap();
      newBuffer = new LocalCollection._IdMap();

      // Query 2x documents as the half excluded from the original query will go
      // into unpublished buffer to reduce additional Mongo lookups in cases
      // when documents are removed from the published set and need a
      // replacement.
      // XXX needs more thought on non-zero skip
      // XXX 2 is a "magic number" meaning there is an extra chunk of docs for
      // buffer if such is needed.
      var cursor = self._cursorForQuery({
        limit: self._limit * 2
      });
      try {
        cursor.forEach(function (doc, i) {
          // yields
          if (!self._limit || i < self._limit) {
            newResults.set(doc._id, doc);
          } else {
            newBuffer.set(doc._id, doc);
          }
        });
        break;
      } catch (e) {
        if (options.initial && typeof e.code === 'number') {
          // This is an error document sent to us by mongod, not a connection
          // error generated by the client. And we've never seen this query work
          // successfully. Probably it's a bad selector or something, so we
          // should NOT retry. Instead, we should halt the observe (which ends
          // up calling `stop` on us).
          self._multiplexer.queryError(e);
          return;
        }

        // During failover (eg) if we get an exception we should log and retry
        // instead of crashing.
        Meteor._debug("Got exception while polling query", e);
        Meteor._sleepForMs(100);
      }
    }
    if (self._stopped) return;
    self._publishNewResults(newResults, newBuffer);
  },
  // Transitions to QUERYING and runs another query, or (if already in QUERYING)
  // ensures that we will query again later.
  //
  // This function may not block, because it is called from an oplog entry
  // handler. However, if we were not already in the QUERYING phase, it throws
  // an exception that is caught by the closest surrounding
  // finishIfNeedToPollQuery call; this ensures that we don't continue running
  // close that was designed for another phase inside PHASE.QUERYING.
  //
  // (It's also necessary whenever logic in this file yields to check that other
  // phases haven't put us into QUERYING mode, though; eg,
  // _fetchModifiedDocuments does this.)
  _needToPollQuery: function () {
    var self = this;
    Meteor._noYieldsAllowed(function () {
      if (self._stopped) return;

      // If we're not already in the middle of a query, we can query now
      // (possibly pausing FETCHING).
      if (self._phase !== PHASE.QUERYING) {
        self._pollQuery();
        throw new SwitchedToQuery();
      }

      // We're currently in QUERYING. Set a flag to ensure that we run another
      // query when we're done.
      self._requeryWhenDoneThisQuery = true;
    });
  },
  // Yields!
  _doneQuerying: function () {
    var self = this;
    if (self._stopped) return;
    self._mongoHandle._oplogHandle.waitUntilCaughtUp(); // yields
    if (self._stopped) return;
    if (self._phase !== PHASE.QUERYING) throw Error("Phase unexpectedly " + self._phase);
    Meteor._noYieldsAllowed(function () {
      if (self._requeryWhenDoneThisQuery) {
        self._requeryWhenDoneThisQuery = false;
        self._pollQuery();
      } else if (self._needToFetch.empty()) {
        self._beSteady();
      } else {
        self._fetchModifiedDocuments();
      }
    });
  },
  _cursorForQuery: function (optionsOverwrite) {
    var self = this;
    return Meteor._noYieldsAllowed(function () {
      // The query we run is almost the same as the cursor we are observing,
      // with a few changes. We need to read all the fields that are relevant to
      // the selector, not just the fields we are going to publish (that's the
      // "shared" projection). And we don't want to apply any transform in the
      // cursor, because observeChanges shouldn't use the transform.
      var options = _.clone(self._cursorDescription.options);

      // Allow the caller to modify the options. Useful to specify different
      // skip and limit values.
      _.extend(options, optionsOverwrite);
      options.fields = self._sharedProjection;
      delete options.transform;
      // We are NOT deep cloning fields or selector here, which should be OK.
      var description = new CursorDescription(self._cursorDescription.collectionName, self._cursorDescription.selector, options);
      return new Cursor(self._mongoHandle, description);
    });
  },
  // Replace self._published with newResults (both are IdMaps), invoking observe
  // callbacks on the multiplexer.
  // Replace self._unpublishedBuffer with newBuffer.
  //
  // XXX This is very similar to LocalCollection._diffQueryUnorderedChanges. We
  // should really: (a) Unify IdMap and OrderedDict into Unordered/OrderedDict
  // (b) Rewrite diff.js to use these classes instead of arrays and objects.
  _publishNewResults: function (newResults, newBuffer) {
    var self = this;
    Meteor._noYieldsAllowed(function () {
      // If the query is limited and there is a buffer, shut down so it doesn't
      // stay in a way.
      if (self._limit) {
        self._unpublishedBuffer.clear();
      }

      // First remove anything that's gone. Be careful not to modify
      // self._published while iterating over it.
      var idsToRemove = [];
      self._published.forEach(function (doc, id) {
        if (!newResults.has(id)) idsToRemove.push(id);
      });
      _.each(idsToRemove, function (id) {
        self._removePublished(id);
      });

      // Now do adds and changes.
      // If self has a buffer and limit, the new fetched result will be
      // limited correctly as the query has sort specifier.
      newResults.forEach(function (doc, id) {
        self._handleDoc(id, doc);
      });

      // Sanity-check that everything we tried to put into _published ended up
      // there.
      // XXX if this is slow, remove it later
      if (self._published.size() !== newResults.size()) {
        Meteor._debug('The Mongo server and the Meteor query disagree on how ' + 'many documents match your query. Cursor description: ', self._cursorDescription);
      }
      self._published.forEach(function (doc, id) {
        if (!newResults.has(id)) throw Error("_published has a doc that newResults doesn't; " + id);
      });

      // Finally, replace the buffer
      newBuffer.forEach(function (doc, id) {
        self._addBuffered(id, doc);
      });
      self._safeAppendToBuffer = newBuffer.size() < self._limit;
    });
  },
  // This stop function is invoked from the onStop of the ObserveMultiplexer, so
  // it shouldn't actually be possible to call it until the multiplexer is
  // ready.
  //
  // It's important to check self._stopped after every call in this file that
  // can yield!
  stop: function () {
    var self = this;
    if (self._stopped) return;
    self._stopped = true;
    _.each(self._stopHandles, function (handle) {
      handle.stop();
    });

    // Note: we *don't* use multiplexer.onFlush here because this stop
    // callback is actually invoked by the multiplexer itself when it has
    // determined that there are no handles left. So nothing is actually going
    // to get flushed (and it's probably not valid to call methods on the
    // dying multiplexer).
    _.each(self._writesToCommitWhenWeReachSteady, function (w) {
      w.committed(); // maybe yields?
    });

    self._writesToCommitWhenWeReachSteady = null;

    // Proactively drop references to potentially big things.
    self._published = null;
    self._unpublishedBuffer = null;
    self._needToFetch = null;
    self._currentlyFetching = null;
    self._oplogEntryHandle = null;
    self._listenersHandle = null;
    Package['facts-base'] && Package['facts-base'].Facts.incrementServerFact("mongo-livedata", "observe-drivers-oplog", -1);
  },
  _registerPhaseChange: function (phase) {
    var self = this;
    Meteor._noYieldsAllowed(function () {
      var now = new Date();
      if (self._phase) {
        var timeDiff = now - self._phaseStartTime;
        Package['facts-base'] && Package['facts-base'].Facts.incrementServerFact("mongo-livedata", "time-spent-in-" + self._phase + "-phase", timeDiff);
      }
      self._phase = phase;
      self._phaseStartTime = now;
    });
  }
});

// Does our oplog tailing code support this cursor? For now, we are being very
// conservative and allowing only simple queries with simple options.
// (This is a "static method".)
OplogObserveDriver.cursorSupported = function (cursorDescription, matcher) {
  // First, check the options.
  var options = cursorDescription.options;

  // Did the user say no explicitly?
  // underscored version of the option is COMPAT with 1.2
  if (options.disableOplog || options._disableOplog) return false;

  // skip is not supported: to support it we would need to keep track of all
  // "skipped" documents or at least their ids.
  // limit w/o a sort specifier is not supported: current implementation needs a
  // deterministic way to order documents.
  if (options.skip || options.limit && !options.sort) return false;

  // If a fields projection option is given check if it is supported by
  // minimongo (some operators are not supported).
  const fields = options.fields || options.projection;
  if (fields) {
    try {
      LocalCollection._checkSupportedProjection(fields);
    } catch (e) {
      if (e.name === "MinimongoError") {
        return false;
      } else {
        throw e;
      }
    }
  }

  // We don't allow the following selectors:
  //   - $where (not confident that we provide the same JS environment
  //             as Mongo, and can yield!)
  //   - $near (has "interesting" properties in MongoDB, like the possibility
  //            of returning an ID multiple times, though even polling maybe
  //            have a bug there)
  //           XXX: once we support it, we would need to think more on how we
  //           initialize the comparators when we create the driver.
  return !matcher.hasWhere() && !matcher.hasGeoQuery();
};
var modifierCanBeDirectlyApplied = function (modifier) {
  return _.all(modifier, function (fields, operation) {
    return _.all(fields, function (value, field) {
      return !/EJSON\$/.test(field);
    });
  });
};
MongoInternals.OplogObserveDriver = OplogObserveDriver;
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"oplog_v2_converter.js":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/mongo/oplog_v2_converter.js                                                                                //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
module.export({
  oplogV2V1Converter: () => oplogV2V1Converter
});
// Converter of the new MongoDB Oplog format (>=5.0) to the one that Meteor
// handles well, i.e., `$set` and `$unset`. The new format is completely new,
// and looks as follows:
//
//   { $v: 2, diff: Diff }
//
// where `Diff` is a recursive structure:
//
//   {
//     // Nested updates (sometimes also represented with an s-field).
//     // Example: `{ $set: { 'foo.bar': 1 } }`.
//     i: { <key>: <value>, ... },
//
//     // Top-level updates.
//     // Example: `{ $set: { foo: { bar: 1 } } }`.
//     u: { <key>: <value>, ... },
//
//     // Unsets.
//     // Example: `{ $unset: { foo: '' } }`.
//     d: { <key>: false, ... },
//
//     // Array operations.
//     // Example: `{ $push: { foo: 'bar' } }`.
//     s<key>: { a: true, u<index>: <value>, ... },
//     ...
//
//     // Nested operations (sometimes also represented in the `i` field).
//     // Example: `{ $set: { 'foo.bar': 1 } }`.
//     s<key>: Diff,
//     ...
//   }
//
// (all fields are optional).

function join(prefix, key) {
  return prefix ? "".concat(prefix, ".").concat(key) : key;
}
const arrayOperatorKeyRegex = /^(a|[su]\d+)$/;
function isArrayOperatorKey(field) {
  return arrayOperatorKeyRegex.test(field);
}
function isArrayOperator(operator) {
  return operator.a === true && Object.keys(operator).every(isArrayOperatorKey);
}
function flattenObjectInto(target, source, prefix) {
  if (Array.isArray(source) || typeof source !== 'object' || source === null) {
    target[prefix] = source;
  } else {
    const entries = Object.entries(source);
    if (entries.length) {
      entries.forEach(_ref => {
        let [key, value] = _ref;
        flattenObjectInto(target, value, join(prefix, key));
      });
    } else {
      target[prefix] = source;
    }
  }
}
const logDebugMessages = !!process.env.OPLOG_CONVERTER_DEBUG;
function convertOplogDiff(oplogEntry, diff, prefix) {
  if (logDebugMessages) {
    console.log("convertOplogDiff(".concat(JSON.stringify(oplogEntry), ", ").concat(JSON.stringify(diff), ", ").concat(JSON.stringify(prefix), ")"));
  }
  Object.entries(diff).forEach(_ref2 => {
    let [diffKey, value] = _ref2;
    if (diffKey === 'd') {
      var _oplogEntry$$unset;
      // Handle `$unset`s.
      (_oplogEntry$$unset = oplogEntry.$unset) !== null && _oplogEntry$$unset !== void 0 ? _oplogEntry$$unset : oplogEntry.$unset = {};
      Object.keys(value).forEach(key => {
        oplogEntry.$unset[join(prefix, key)] = true;
      });
    } else if (diffKey === 'i') {
      var _oplogEntry$$set;
      // Handle (potentially) nested `$set`s.
      (_oplogEntry$$set = oplogEntry.$set) !== null && _oplogEntry$$set !== void 0 ? _oplogEntry$$set : oplogEntry.$set = {};
      flattenObjectInto(oplogEntry.$set, value, prefix);
    } else if (diffKey === 'u') {
      var _oplogEntry$$set2;
      // Handle flat `$set`s.
      (_oplogEntry$$set2 = oplogEntry.$set) !== null && _oplogEntry$$set2 !== void 0 ? _oplogEntry$$set2 : oplogEntry.$set = {};
      Object.entries(value).forEach(_ref3 => {
        let [key, value] = _ref3;
        oplogEntry.$set[join(prefix, key)] = value;
      });
    } else {
      // Handle s-fields.
      const key = diffKey.slice(1);
      if (isArrayOperator(value)) {
        // Array operator.
        Object.entries(value).forEach(_ref4 => {
          let [position, value] = _ref4;
          if (position === 'a') {
            return;
          }
          const positionKey = join(join(prefix, key), position.slice(1));
          if (position[0] === 's') {
            convertOplogDiff(oplogEntry, value, positionKey);
          } else if (value === null) {
            var _oplogEntry$$unset2;
            (_oplogEntry$$unset2 = oplogEntry.$unset) !== null && _oplogEntry$$unset2 !== void 0 ? _oplogEntry$$unset2 : oplogEntry.$unset = {};
            oplogEntry.$unset[positionKey] = true;
          } else {
            var _oplogEntry$$set3;
            (_oplogEntry$$set3 = oplogEntry.$set) !== null && _oplogEntry$$set3 !== void 0 ? _oplogEntry$$set3 : oplogEntry.$set = {};
            oplogEntry.$set[positionKey] = value;
          }
        });
      } else if (key) {
        // Nested object.
        convertOplogDiff(oplogEntry, value, join(prefix, key));
      }
    }
  });
}
function oplogV2V1Converter(oplogEntry) {
  // Pass-through v1 and (probably) invalid entries.
  if (oplogEntry.$v !== 2 || !oplogEntry.diff) {
    return oplogEntry;
  }
  const convertedOplogEntry = {
    $v: 2
  };
  convertOplogDiff(convertedOplogEntry, oplogEntry.diff, '');
  return convertedOplogEntry;
}
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"local_collection_driver.js":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/mongo/local_collection_driver.js                                                                           //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
module.export({
  LocalCollectionDriver: () => LocalCollectionDriver
});
const LocalCollectionDriver = new class LocalCollectionDriver {
  constructor() {
    this.noConnCollections = Object.create(null);
  }
  open(name, conn) {
    if (!name) {
      return new LocalCollection();
    }
    if (!conn) {
      return ensureCollection(name, this.noConnCollections);
    }
    if (!conn._mongo_livedata_collections) {
      conn._mongo_livedata_collections = Object.create(null);
    }

    // XXX is there a way to keep track of a connection's collections without
    // dangling it off the connection object?
    return ensureCollection(name, conn._mongo_livedata_collections);
  }
}();
function ensureCollection(name, collections) {
  return name in collections ? collections[name] : collections[name] = new LocalCollection(name);
}
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"remote_collection_driver.js":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/mongo/remote_collection_driver.js                                                                          //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
let ASYNC_COLLECTION_METHODS, getAsyncMethodName;
module.link("meteor/minimongo/constants", {
  ASYNC_COLLECTION_METHODS(v) {
    ASYNC_COLLECTION_METHODS = v;
  },
  getAsyncMethodName(v) {
    getAsyncMethodName = v;
  }
}, 0);
MongoInternals.RemoteCollectionDriver = function (mongo_url, options) {
  var self = this;
  self.mongo = new MongoConnection(mongo_url, options);
};
const REMOTE_COLLECTION_METHODS = ['_createCappedCollection', '_dropIndex', '_ensureIndex', 'createIndex', 'countDocuments', 'dropCollection', 'estimatedDocumentCount', 'find', 'findOne', 'insert', 'rawCollection', 'remove', 'update', 'upsert'];
Object.assign(MongoInternals.RemoteCollectionDriver.prototype, {
  open: function (name) {
    var self = this;
    var ret = {};
    REMOTE_COLLECTION_METHODS.forEach(function (m) {
      ret[m] = _.bind(self.mongo[m], self.mongo, name);
      if (!ASYNC_COLLECTION_METHODS.includes(m)) return;
      const asyncMethodName = getAsyncMethodName(m);
      ret[asyncMethodName] = function () {
        try {
          return Promise.resolve(ret[m](...arguments));
        } catch (error) {
          return Promise.reject(error);
        }
      };
    });
    return ret;
  }
});

// Create the singleton RemoteCollectionDriver only on demand, so we
// only require Mongo configuration if it's actually used (eg, not if
// you're only trying to receive data from a remote DDP server.)
MongoInternals.defaultRemoteCollectionDriver = _.once(function () {
  var connectionOptions = {};
  var mongoUrl = process.env.MONGO_URL;
  if (process.env.MONGO_OPLOG_URL) {
    connectionOptions.oplogUrl = process.env.MONGO_OPLOG_URL;
  }
  if (!mongoUrl) throw new Error("MONGO_URL must be set in environment");
  const driver = new MongoInternals.RemoteCollectionDriver(mongoUrl, connectionOptions);

  // As many deployment tools, including Meteor Up, send requests to the app in
  // order to confirm that the deployment finished successfully, it's required
  // to know about a database connection problem before the app starts. Doing so
  // in a `Meteor.startup` is fine, as the `WebApp` handles requests only after
  // all are finished.
  Meteor.startup(() => {
    Promise.await(driver.mongo.client.connect());
  });
  return driver;
});
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"collection.js":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/mongo/collection.js                                                                                        //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
!function (module1) {
  let _objectSpread;
  module1.link("@babel/runtime/helpers/objectSpread2", {
    default(v) {
      _objectSpread = v;
    }
  }, 0);
  module1.export({
    warnUsingOldApi: () => warnUsingOldApi
  });
  let ASYNC_COLLECTION_METHODS, getAsyncMethodName;
  module1.link("meteor/minimongo/constants", {
    ASYNC_COLLECTION_METHODS(v) {
      ASYNC_COLLECTION_METHODS = v;
    },
    getAsyncMethodName(v) {
      getAsyncMethodName = v;
    }
  }, 0);
  let normalizeProjection;
  module1.link("./mongo_utils", {
    normalizeProjection(v) {
      normalizeProjection = v;
    }
  }, 1);
  function warnUsingOldApi(methodName, collectionName, isCalledFromAsync) {
    if (process.env.WARN_WHEN_USING_OLD_API &&
    // also ensures it is on the server
    !isCalledFromAsync // must be true otherwise we should log
    ) {
      if (collectionName === undefined || collectionName.includes('oplog')) return;
      console.warn("\n   \n   Calling method ".concat(collectionName, ".").concat(methodName, " from old API on server.\n   This method will be removed, from the server, in version 3.\n   Trace is below:"));
      console.trace();
    }
    ;
  }
  /**
   * @summary Namespace for MongoDB-related items
   * @namespace
   */
  Mongo = {};

  /**
   * @summary Constructor for a Collection
   * @locus Anywhere
   * @instancename collection
   * @class
   * @param {String} name The name of the collection.  If null, creates an unmanaged (unsynchronized) local collection.
   * @param {Object} [options]
   * @param {Object} options.connection The server connection that will manage this collection. Uses the default connection if not specified.  Pass the return value of calling [`DDP.connect`](#ddp_connect) to specify a different server. Pass `null` to specify no connection. Unmanaged (`name` is null) collections cannot specify a connection.
   * @param {String} options.idGeneration The method of generating the `_id` fields of new documents in this collection.  Possible values:
  
   - **`'STRING'`**: random strings
   - **`'MONGO'`**:  random [`Mongo.ObjectID`](#mongo_object_id) values
  
  The default id generation technique is `'STRING'`.
   * @param {Function} options.transform An optional transformation function. Documents will be passed through this function before being returned from `fetch` or `findOne`, and before being passed to callbacks of `observe`, `map`, `forEach`, `allow`, and `deny`. Transforms are *not* applied for the callbacks of `observeChanges` or to cursors returned from publish functions.
   * @param {Boolean} options.defineMutationMethods Set to `false` to skip setting up the mutation methods that enable insert/update/remove from client code. Default `true`.
   */
  Mongo.Collection = function Collection(name, options) {
    if (!name && name !== null) {
      Meteor._debug('Warning: creating anonymous collection. It will not be ' + 'saved or synchronized over the network. (Pass null for ' + 'the collection name to turn off this warning.)');
      name = null;
    }
    if (name !== null && typeof name !== 'string') {
      throw new Error('First argument to new Mongo.Collection must be a string or null');
    }
    if (options && options.methods) {
      // Backwards compatibility hack with original signature (which passed
      // "connection" directly instead of in options. (Connections must have a "methods"
      // method.)
      // XXX remove before 1.0
      options = {
        connection: options
      };
    }
    // Backwards compatibility: "connection" used to be called "manager".
    if (options && options.manager && !options.connection) {
      options.connection = options.manager;
    }
    options = _objectSpread({
      connection: undefined,
      idGeneration: 'STRING',
      transform: null,
      _driver: undefined,
      _preventAutopublish: false
    }, options);
    switch (options.idGeneration) {
      case 'MONGO':
        this._makeNewID = function () {
          var src = name ? DDP.randomStream('/collection/' + name) : Random.insecure;
          return new Mongo.ObjectID(src.hexString(24));
        };
        break;
      case 'STRING':
      default:
        this._makeNewID = function () {
          var src = name ? DDP.randomStream('/collection/' + name) : Random.insecure;
          return src.id();
        };
        break;
    }
    this._transform = LocalCollection.wrapTransform(options.transform);
    if (!name || options.connection === null)
      // note: nameless collections never have a connection
      this._connection = null;else if (options.connection) this._connection = options.connection;else if (Meteor.isClient) this._connection = Meteor.connection;else this._connection = Meteor.server;
    if (!options._driver) {
      // XXX This check assumes that webapp is loaded so that Meteor.server !==
      // null. We should fully support the case of "want to use a Mongo-backed
      // collection from Node code without webapp", but we don't yet.
      // #MeteorServerNull
      if (name && this._connection === Meteor.server && typeof MongoInternals !== 'undefined' && MongoInternals.defaultRemoteCollectionDriver) {
        options._driver = MongoInternals.defaultRemoteCollectionDriver();
      } else {
        const {
          LocalCollectionDriver
        } = require('./local_collection_driver.js');
        options._driver = LocalCollectionDriver;
      }
    }
    this._collection = options._driver.open(name, this._connection);
    this._name = name;
    this._driver = options._driver;
    this._maybeSetUpReplication(name, options);

    // XXX don't define these until allow or deny is actually used for this
    // collection. Could be hard if the security rules are only defined on the
    // server.
    if (options.defineMutationMethods !== false) {
      try {
        this._defineMutationMethods({
          useExisting: options._suppressSameNameError === true
        });
      } catch (error) {
        // Throw a more understandable error on the server for same collection name
        if (error.message === "A method named '/".concat(name, "/insert' is already defined")) throw new Error("There is already a collection named \"".concat(name, "\""));
        throw error;
      }
    }

    // autopublish
    if (Package.autopublish && !options._preventAutopublish && this._connection && this._connection.publish) {
      this._connection.publish(null, () => this.find(), {
        is_auto: true
      });
    }
  };
  Object.assign(Mongo.Collection.prototype, {
    _maybeSetUpReplication(name, _ref2) {
      let {
        _suppressSameNameError = false
      } = _ref2;
      const self = this;
      if (!(self._connection && self._connection.registerStore)) {
        return;
      }

      // OK, we're going to be a slave, replicating some remote
      // database, except possibly with some temporary divergence while
      // we have unacknowledged RPC's.
      const ok = self._connection.registerStore(name, {
        // Called at the beginning of a batch of updates. batchSize is the number
        // of update calls to expect.
        //
        // XXX This interface is pretty janky. reset probably ought to go back to
        // being its own function, and callers shouldn't have to calculate
        // batchSize. The optimization of not calling pause/remove should be
        // delayed until later: the first call to update() should buffer its
        // message, and then we can either directly apply it at endUpdate time if
        // it was the only update, or do pauseObservers/apply/apply at the next
        // update() if there's another one.
        beginUpdate(batchSize, reset) {
          // pause observers so users don't see flicker when updating several
          // objects at once (including the post-reconnect reset-and-reapply
          // stage), and so that a re-sorting of a query can take advantage of the
          // full _diffQuery moved calculation instead of applying change one at a
          // time.
          if (batchSize > 1 || reset) self._collection.pauseObservers();
          if (reset) self._collection.remove({});
        },
        // Apply an update.
        // XXX better specify this interface (not in terms of a wire message)?
        update(msg) {
          var mongoId = MongoID.idParse(msg.id);
          var doc = self._collection._docs.get(mongoId);

          //When the server's mergebox is disabled for a collection, the client must gracefully handle it when:
          // *We receive an added message for a document that is already there. Instead, it will be changed
          // *We reeive a change message for a document that is not there. Instead, it will be added
          // *We receive a removed messsage for a document that is not there. Instead, noting wil happen.

          //Code is derived from client-side code originally in peerlibrary:control-mergebox
          //https://github.com/peerlibrary/meteor-control-mergebox/blob/master/client.coffee

          //For more information, refer to discussion "Initial support for publication strategies in livedata server":
          //https://github.com/meteor/meteor/pull/11151
          if (Meteor.isClient) {
            if (msg.msg === 'added' && doc) {
              msg.msg = 'changed';
            } else if (msg.msg === 'removed' && !doc) {
              return;
            } else if (msg.msg === 'changed' && !doc) {
              msg.msg = 'added';
              _ref = msg.fields;
              for (field in _ref) {
                value = _ref[field];
                if (value === void 0) {
                  delete msg.fields[field];
                }
              }
            }
          }

          // Is this a "replace the whole doc" message coming from the quiescence
          // of method writes to an object? (Note that 'undefined' is a valid
          // value meaning "remove it".)
          if (msg.msg === 'replace') {
            var replace = msg.replace;
            if (!replace) {
              if (doc) self._collection.remove(mongoId);
            } else if (!doc) {
              self._collection.insert(replace);
            } else {
              // XXX check that replace has no $ ops
              self._collection.update(mongoId, replace);
            }
            return;
          } else if (msg.msg === 'added') {
            if (doc) {
              throw new Error('Expected not to find a document already present for an add');
            }
            self._collection.insert(_objectSpread({
              _id: mongoId
            }, msg.fields));
          } else if (msg.msg === 'removed') {
            if (!doc) throw new Error('Expected to find a document already present for removed');
            self._collection.remove(mongoId);
          } else if (msg.msg === 'changed') {
            if (!doc) throw new Error('Expected to find a document to change');
            const keys = Object.keys(msg.fields);
            if (keys.length > 0) {
              var modifier = {};
              keys.forEach(key => {
                const value = msg.fields[key];
                if (EJSON.equals(doc[key], value)) {
                  return;
                }
                if (typeof value === 'undefined') {
                  if (!modifier.$unset) {
                    modifier.$unset = {};
                  }
                  modifier.$unset[key] = 1;
                } else {
                  if (!modifier.$set) {
                    modifier.$set = {};
                  }
                  modifier.$set[key] = value;
                }
              });
              if (Object.keys(modifier).length > 0) {
                self._collection.update(mongoId, modifier);
              }
            }
          } else {
            throw new Error("I don't know how to deal with this message");
          }
        },
        // Called at the end of a batch of updates.
        endUpdate() {
          self._collection.resumeObservers();
        },
        // Called around method stub invocations to capture the original versions
        // of modified documents.
        saveOriginals() {
          self._collection.saveOriginals();
        },
        retrieveOriginals() {
          return self._collection.retrieveOriginals();
        },
        // Used to preserve current versions of documents across a store reset.
        getDoc(id) {
          return self.findOne(id);
        },
        // To be able to get back to the collection from the store.
        _getCollection() {
          return self;
        }
      });
      if (!ok) {
        const message = "There is already a collection named \"".concat(name, "\"");
        if (_suppressSameNameError === true) {
          // XXX In theory we do not have to throw when `ok` is falsy. The
          // store is already defined for this collection name, but this
          // will simply be another reference to it and everything should
          // work. However, we have historically thrown an error here, so
          // for now we will skip the error only when _suppressSameNameError
          // is `true`, allowing people to opt in and give this some real
          // world testing.
          console.warn ? console.warn(message) : console.log(message);
        } else {
          throw new Error(message);
        }
      }
    },
    ///
    /// Main collection API
    ///
    /**
     * @summary Gets the number of documents matching the filter. For a fast count of the total documents in a collection see `estimatedDocumentCount`.
     * @locus Anywhere
     * @method countDocuments
     * @memberof Mongo.Collection
     * @instance
     * @param {MongoSelector} [selector] A query describing the documents to count
     * @param {Object} [options] All options are listed in [MongoDB documentation](https://mongodb.github.io/node-mongodb-native/4.11/interfaces/CountDocumentsOptions.html). Please note that not all of them are available on the client.
     * @returns {Promise<number>}
     */
    countDocuments() {
      return this._collection.countDocuments(...arguments);
    },
    /**
     * @summary Gets an estimate of the count of documents in a collection using collection metadata. For an exact count of the documents in a collection see `countDocuments`.
     * @locus Anywhere
     * @method estimatedDocumentCount
     * @memberof Mongo.Collection
     * @instance
     * @param {Object} [options] All options are listed in [MongoDB documentation](https://mongodb.github.io/node-mongodb-native/4.11/interfaces/EstimatedDocumentCountOptions.html). Please note that not all of them are available on the client.
     * @returns {Promise<number>}
     */
    estimatedDocumentCount() {
      return this._collection.estimatedDocumentCount(...arguments);
    },
    _getFindSelector(args) {
      if (args.length == 0) return {};else return args[0];
    },
    _getFindOptions(args) {
      const [, options] = args || [];
      const newOptions = normalizeProjection(options);
      var self = this;
      if (args.length < 2) {
        return {
          transform: self._transform
        };
      } else {
        check(newOptions, Match.Optional(Match.ObjectIncluding({
          projection: Match.Optional(Match.OneOf(Object, undefined)),
          sort: Match.Optional(Match.OneOf(Object, Array, Function, undefined)),
          limit: Match.Optional(Match.OneOf(Number, undefined)),
          skip: Match.Optional(Match.OneOf(Number, undefined))
        })));
        return _objectSpread({
          transform: self._transform
        }, newOptions);
      }
    },
    /**
     * @summary Find the documents in a collection that match the selector.
     * @locus Anywhere
     * @method find
     * @memberof Mongo.Collection
     * @instance
     * @param {MongoSelector} [selector] A query describing the documents to find
     * @param {Object} [options]
     * @param {MongoSortSpecifier} options.sort Sort order (default: natural order)
     * @param {Number} options.skip Number of results to skip at the beginning
     * @param {Number} options.limit Maximum number of results to return
     * @param {MongoFieldSpecifier} options.fields Dictionary of fields to return or exclude.
     * @param {Boolean} options.reactive (Client only) Default `true`; pass `false` to disable reactivity
     * @param {Function} options.transform Overrides `transform` on the  [`Collection`](#collections) for this cursor.  Pass `null` to disable transformation.
     * @param {Boolean} options.disableOplog (Server only) Pass true to disable oplog-tailing on this query. This affects the way server processes calls to `observe` on this query. Disabling the oplog can be useful when working with data that updates in large batches.
     * @param {Number} options.pollingIntervalMs (Server only) When oplog is disabled (through the use of `disableOplog` or when otherwise not available), the frequency (in milliseconds) of how often to poll this query when observing on the server. Defaults to 10000ms (10 seconds).
     * @param {Number} options.pollingThrottleMs (Server only) When oplog is disabled (through the use of `disableOplog` or when otherwise not available), the minimum time (in milliseconds) to allow between re-polling when observing on the server. Increasing this will save CPU and mongo load at the expense of slower updates to users. Decreasing this is not recommended. Defaults to 50ms.
     * @param {Number} options.maxTimeMs (Server only) If set, instructs MongoDB to set a time limit for this cursor's operations. If the operation reaches the specified time limit (in milliseconds) without the having been completed, an exception will be thrown. Useful to prevent an (accidental or malicious) unoptimized query from causing a full collection scan that would disrupt other database users, at the expense of needing to handle the resulting error.
     * @param {String|Object} options.hint (Server only) Overrides MongoDB's default index selection and query optimization process. Specify an index to force its use, either by its name or index specification. You can also specify `{ $natural : 1 }` to force a forwards collection scan, or `{ $natural : -1 }` for a reverse collection scan. Setting this is only recommended for advanced users.
     * @param {String} options.readPreference (Server only) Specifies a custom MongoDB [`readPreference`](https://docs.mongodb.com/manual/core/read-preference) for this particular cursor. Possible values are `primary`, `primaryPreferred`, `secondary`, `secondaryPreferred` and `nearest`.
     * @returns {Mongo.Cursor}
     */
    find() {
      for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
        args[_key] = arguments[_key];
      }
      // Collection.find() (return all docs) behaves differently
      // from Collection.find(undefined) (return 0 docs).  so be
      // careful about the length of arguments.
      return this._collection.find(this._getFindSelector(args), this._getFindOptions(args));
    },
    /**
     * @summary Finds the first document that matches the selector, as ordered by sort and skip options. Returns `undefined` if no matching document is found.
     * @locus Anywhere
     * @method findOne
     * @memberof Mongo.Collection
     * @instance
     * @param {MongoSelector} [selector] A query describing the documents to find
     * @param {Object} [options]
     * @param {MongoSortSpecifier} options.sort Sort order (default: natural order)
     * @param {Number} options.skip Number of results to skip at the beginning
     * @param {MongoFieldSpecifier} options.fields Dictionary of fields to return or exclude.
     * @param {Boolean} options.reactive (Client only) Default true; pass false to disable reactivity
     * @param {Function} options.transform Overrides `transform` on the [`Collection`](#collections) for this cursor.  Pass `null` to disable transformation.
     * @param {String} options.readPreference (Server only) Specifies a custom MongoDB [`readPreference`](https://docs.mongodb.com/manual/core/read-preference) for fetching the document. Possible values are `primary`, `primaryPreferred`, `secondary`, `secondaryPreferred` and `nearest`.
     * @returns {Object}
     */
    findOne() {
      // [FIBERS]
      // TODO: Remove this when 3.0 is released.
      warnUsingOldApi("findOne", this._name, this.findOne.isCalledFromAsync);
      this.findOne.isCalledFromAsync = false;
      for (var _len2 = arguments.length, args = new Array(_len2), _key2 = 0; _key2 < _len2; _key2++) {
        args[_key2] = arguments[_key2];
      }
      return this._collection.findOne(this._getFindSelector(args), this._getFindOptions(args));
    }
  });
  Object.assign(Mongo.Collection, {
    _publishCursor(cursor, sub, collection) {
      var observeHandle = cursor.observeChanges({
        added: function (id, fields) {
          sub.added(collection, id, fields);
        },
        changed: function (id, fields) {
          sub.changed(collection, id, fields);
        },
        removed: function (id) {
          sub.removed(collection, id);
        }
      },
      // Publications don't mutate the documents
      // This is tested by the `livedata - publish callbacks clone` test
      {
        nonMutatingCallbacks: true
      });

      // We don't call sub.ready() here: it gets called in livedata_server, after
      // possibly calling _publishCursor on multiple returned cursors.

      // register stop callback (expects lambda w/ no args).
      sub.onStop(function () {
        observeHandle.stop();
      });

      // return the observeHandle in case it needs to be stopped early
      return observeHandle;
    },
    // protect against dangerous selectors.  falsey and {_id: falsey} are both
    // likely programmer error, and not what you want, particularly for destructive
    // operations. If a falsey _id is sent in, a new string _id will be
    // generated and returned; if a fallbackId is provided, it will be returned
    // instead.
    _rewriteSelector(selector) {
      let {
        fallbackId
      } = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
      // shorthand -- scalars match _id
      if (LocalCollection._selectorIsId(selector)) selector = {
        _id: selector
      };
      if (Array.isArray(selector)) {
        // This is consistent with the Mongo console itself; if we don't do this
        // check passing an empty array ends up selecting all items
        throw new Error("Mongo selector can't be an array.");
      }
      if (!selector || '_id' in selector && !selector._id) {
        // can't match anything
        return {
          _id: fallbackId || Random.id()
        };
      }
      return selector;
    }
  });
  Object.assign(Mongo.Collection.prototype, {
    // 'insert' immediately returns the inserted document's new _id.
    // The others return values immediately if you are in a stub, an in-memory
    // unmanaged collection, or a mongo-backed collection and you don't pass a
    // callback. 'update' and 'remove' return the number of affected
    // documents. 'upsert' returns an object with keys 'numberAffected' and, if an
    // insert happened, 'insertedId'.
    //
    // Otherwise, the semantics are exactly like other methods: they take
    // a callback as an optional last argument; if no callback is
    // provided, they block until the operation is complete, and throw an
    // exception if it fails; if a callback is provided, then they don't
    // necessarily block, and they call the callback when they finish with error and
    // result arguments.  (The insert method provides the document ID as its result;
    // update and remove provide the number of affected docs as the result; upsert
    // provides an object with numberAffected and maybe insertedId.)
    //
    // On the client, blocking is impossible, so if a callback
    // isn't provided, they just return immediately and any error
    // information is lost.
    //
    // There's one more tweak. On the client, if you don't provide a
    // callback, then if there is an error, a message will be logged with
    // Meteor._debug.
    //
    // The intent (though this is actually determined by the underlying
    // drivers) is that the operations should be done synchronously, not
    // generating their result until the database has acknowledged
    // them. In the future maybe we should provide a flag to turn this
    // off.

    /**
     * @summary Insert a document in the collection.  Returns its unique _id.
     * @locus Anywhere
     * @method  insert
     * @memberof Mongo.Collection
     * @instance
     * @param {Object} doc The document to insert. May not yet have an _id attribute, in which case Meteor will generate one for you.
     * @param {Function} [callback] Optional.  If present, called with an error object as the first argument and, if no error, the _id as the second.
     */
    insert(doc, callback) {
      // Make sure we were passed a document to insert
      if (!doc) {
        throw new Error('insert requires an argument');
      }

      // [FIBERS]
      // TODO: Remove this when 3.0 is released.
      warnUsingOldApi("insert", this._name, this.insert.isCalledFromAsync);
      this.insert.isCalledFromAsync = false;

      // Make a shallow clone of the document, preserving its prototype.
      doc = Object.create(Object.getPrototypeOf(doc), Object.getOwnPropertyDescriptors(doc));
      if ('_id' in doc) {
        if (!doc._id || !(typeof doc._id === 'string' || doc._id instanceof Mongo.ObjectID)) {
          throw new Error('Meteor requires document _id fields to be non-empty strings or ObjectIDs');
        }
      } else {
        let generateId = true;

        // Don't generate the id if we're the client and the 'outermost' call
        // This optimization saves us passing both the randomSeed and the id
        // Passing both is redundant.
        if (this._isRemoteCollection()) {
          const enclosing = DDP._CurrentMethodInvocation.get();
          if (!enclosing) {
            generateId = false;
          }
        }
        if (generateId) {
          doc._id = this._makeNewID();
        }
      }

      // On inserts, always return the id that we generated; on all other
      // operations, just return the result from the collection.
      var chooseReturnValueFromCollectionResult = function (result) {
        if (doc._id) {
          return doc._id;
        }

        // XXX what is this for??
        // It's some iteraction between the callback to _callMutatorMethod and
        // the return value conversion
        doc._id = result;
        return result;
      };
      const wrappedCallback = wrapCallback(callback, chooseReturnValueFromCollectionResult);
      if (this._isRemoteCollection()) {
        const result = this._callMutatorMethod('insert', [doc], wrappedCallback);
        return chooseReturnValueFromCollectionResult(result);
      }

      // it's my collection.  descend into the collection object
      // and propagate any exception.
      try {
        // If the user provided a callback and the collection implements this
        // operation asynchronously, then queryRet will be undefined, and the
        // result will be returned through the callback instead.
        const result = this._collection.insert(doc, wrappedCallback);
        return chooseReturnValueFromCollectionResult(result);
      } catch (e) {
        if (callback) {
          callback(e);
          return null;
        }
        throw e;
      }
    },
    /**
     * @summary Modify one or more documents in the collection. Returns the number of matched documents.
     * @locus Anywhere
     * @method update
     * @memberof Mongo.Collection
     * @instance
     * @param {MongoSelector} selector Specifies which documents to modify
     * @param {MongoModifier} modifier Specifies how to modify the documents
     * @param {Object} [options]
     * @param {Boolean} options.multi True to modify all matching documents; false to only modify one of the matching documents (the default).
     * @param {Boolean} options.upsert True to insert a document if no matching documents are found.
     * @param {Array} options.arrayFilters Optional. Used in combination with MongoDB [filtered positional operator](https://docs.mongodb.com/manual/reference/operator/update/positional-filtered/) to specify which elements to modify in an array field.
     * @param {Function} [callback] Optional.  If present, called with an error object as the first argument and, if no error, the number of affected documents as the second.
     */
    update(selector, modifier) {
      for (var _len3 = arguments.length, optionsAndCallback = new Array(_len3 > 2 ? _len3 - 2 : 0), _key3 = 2; _key3 < _len3; _key3++) {
        optionsAndCallback[_key3 - 2] = arguments[_key3];
      }
      const callback = popCallbackFromArgs(optionsAndCallback);

      // We've already popped off the callback, so we are left with an array
      // of one or zero items
      const options = _objectSpread({}, optionsAndCallback[0] || null);
      let insertedId;
      if (options && options.upsert) {
        // set `insertedId` if absent.  `insertedId` is a Meteor extension.
        if (options.insertedId) {
          if (!(typeof options.insertedId === 'string' || options.insertedId instanceof Mongo.ObjectID)) throw new Error('insertedId must be string or ObjectID');
          insertedId = options.insertedId;
        } else if (!selector || !selector._id) {
          insertedId = this._makeNewID();
          options.generatedId = true;
          options.insertedId = insertedId;
        }
      }

      // [FIBERS]
      // TODO: Remove this when 3.0 is released.
      warnUsingOldApi("update", this._name, this.update.isCalledFromAsync);
      this.update.isCalledFromAsync = false;
      selector = Mongo.Collection._rewriteSelector(selector, {
        fallbackId: insertedId
      });
      const wrappedCallback = wrapCallback(callback);
      if (this._isRemoteCollection()) {
        const args = [selector, modifier, options];
        return this._callMutatorMethod('update', args, wrappedCallback);
      }

      // it's my collection.  descend into the collection object
      // and propagate any exception.
      try {
        // If the user provided a callback and the collection implements this
        // operation asynchronously, then queryRet will be undefined, and the
        // result will be returned through the callback instead.
        return this._collection.update(selector, modifier, options, wrappedCallback);
      } catch (e) {
        if (callback) {
          callback(e);
          return null;
        }
        throw e;
      }
    },
    /**
     * @summary Remove documents from the collection
     * @locus Anywhere
     * @method remove
     * @memberof Mongo.Collection
     * @instance
     * @param {MongoSelector} selector Specifies which documents to remove
     * @param {Function} [callback] Optional.  If present, called with an error object as its argument.
     */
    remove(selector, callback) {
      selector = Mongo.Collection._rewriteSelector(selector);
      const wrappedCallback = wrapCallback(callback);
      if (this._isRemoteCollection()) {
        return this._callMutatorMethod('remove', [selector], wrappedCallback);
      }

      // [FIBERS]
      // TODO: Remove this when 3.0 is released.
      warnUsingOldApi("remove", this._name, this.remove.isCalledFromAsync);
      this.remove.isCalledFromAsync = false;
      // it's my collection.  descend into the collection object
      // and propagate any exception.
      try {
        // If the user provided a callback and the collection implements this
        // operation asynchronously, then queryRet will be undefined, and the
        // result will be returned through the callback instead.
        return this._collection.remove(selector, wrappedCallback);
      } catch (e) {
        if (callback) {
          callback(e);
          return null;
        }
        throw e;
      }
    },
    // Determine if this collection is simply a minimongo representation of a real
    // database on another server
    _isRemoteCollection() {
      // XXX see #MeteorServerNull
      return this._connection && this._connection !== Meteor.server;
    },
    /**
     * @summary Modify one or more documents in the collection, or insert one if no matching documents were found. Returns an object with keys `numberAffected` (the number of documents modified)  and `insertedId` (the unique _id of the document that was inserted, if any).
     * @locus Anywhere
     * @method upsert
     * @memberof Mongo.Collection
     * @instance
     * @param {MongoSelector} selector Specifies which documents to modify
     * @param {MongoModifier} modifier Specifies how to modify the documents
     * @param {Object} [options]
     * @param {Boolean} options.multi True to modify all matching documents; false to only modify one of the matching documents (the default).
     * @param {Function} [callback] Optional.  If present, called with an error object as the first argument and, if no error, the number of affected documents as the second.
     */
    upsert(selector, modifier, options, callback) {
      if (!callback && typeof options === 'function') {
        callback = options;
        options = {};
      }

      // [FIBERS]
      // TODO: Remove this when 3.0 is released.
      warnUsingOldApi("upsert", this._name, this.upsert.isCalledFromAsync);
      this.upsert.isCalledFromAsync = false;
      // caught here https://github.com/meteor/meteor/issues/12626 
      this.update.isCalledFromAsync = true; // to not trigger on the next call
      return this.update(selector, modifier, _objectSpread(_objectSpread({}, options), {}, {
        _returnObject: true,
        upsert: true
      }), callback);
    },
    // We'll actually design an index API later. For now, we just pass through to
    // Mongo's, but make it synchronous.
    _ensureIndex(index, options) {
      var self = this;
      if (!self._collection._ensureIndex || !self._collection.createIndex) throw new Error('Can only call createIndex on server collections');
      if (self._collection.createIndex) {
        self._collection.createIndex(index, options);
      } else {
        let Log;
        module1.link("meteor/logging", {
          Log(v) {
            Log = v;
          }
        }, 2);
        Log.debug("_ensureIndex has been deprecated, please use the new 'createIndex' instead".concat(options !== null && options !== void 0 && options.name ? ", index name: ".concat(options.name) : ", index: ".concat(JSON.stringify(index))));
        self._collection._ensureIndex(index, options);
      }
    },
    /**
     * @summary Creates the specified index on the collection.
     * @locus server
     * @method createIndex
     * @memberof Mongo.Collection
     * @instance
     * @param {Object} index A document that contains the field and value pairs where the field is the index key and the value describes the type of index for that field. For an ascending index on a field, specify a value of `1`; for descending index, specify a value of `-1`. Use `text` for text indexes.
     * @param {Object} [options] All options are listed in [MongoDB documentation](https://docs.mongodb.com/manual/reference/method/db.collection.createIndex/#options)
     * @param {String} options.name Name of the index
     * @param {Boolean} options.unique Define that the index values must be unique, more at [MongoDB documentation](https://docs.mongodb.com/manual/core/index-unique/)
     * @param {Boolean} options.sparse Define that the index is sparse, more at [MongoDB documentation](https://docs.mongodb.com/manual/core/index-sparse/)
     */
    createIndex(index, options) {
      var self = this;
      if (!self._collection.createIndex) throw new Error('Can only call createIndex on server collections');
      // [FIBERS]
      // TODO: Remove this when 3.0 is released.
      warnUsingOldApi("createIndex", self._name, self.createIndex.isCalledFromAsync);
      self.createIndex.isCalledFromAsync = false;
      try {
        self._collection.createIndex(index, options);
      } catch (e) {
        var _Meteor$settings, _Meteor$settings$pack, _Meteor$settings$pack2;
        if (e.message.includes('An equivalent index already exists with the same name but different options.') && (_Meteor$settings = Meteor.settings) !== null && _Meteor$settings !== void 0 && (_Meteor$settings$pack = _Meteor$settings.packages) !== null && _Meteor$settings$pack !== void 0 && (_Meteor$settings$pack2 = _Meteor$settings$pack.mongo) !== null && _Meteor$settings$pack2 !== void 0 && _Meteor$settings$pack2.reCreateIndexOnOptionMismatch) {
          let Log;
          module1.link("meteor/logging", {
            Log(v) {
              Log = v;
            }
          }, 3);
          Log.info("Re-creating index ".concat(index, " for ").concat(self._name, " due to options mismatch."));
          self._collection._dropIndex(index);
          self._collection.createIndex(index, options);
        } else {
          throw new Meteor.Error("An error occurred when creating an index for collection \"".concat(self._name, ": ").concat(e.message));
        }
      }
    },
    _dropIndex(index) {
      var self = this;
      if (!self._collection._dropIndex) throw new Error('Can only call _dropIndex on server collections');
      self._collection._dropIndex(index);
    },
    _dropCollection() {
      var self = this;
      if (!self._collection.dropCollection) throw new Error('Can only call _dropCollection on server collections');
      self._collection.dropCollection();
    },
    _createCappedCollection(byteSize, maxDocuments) {
      var self = this;
      if (!self._collection._createCappedCollection) throw new Error('Can only call _createCappedCollection on server collections');

      // [FIBERS]
      // TODO: Remove this when 3.0 is released.
      warnUsingOldApi("_createCappedCollection", self._name, self._createCappedCollection.isCalledFromAsync);
      self._createCappedCollection.isCalledFromAsync = false;
      self._collection._createCappedCollection(byteSize, maxDocuments);
    },
    /**
     * @summary Returns the [`Collection`](http://mongodb.github.io/node-mongodb-native/3.0/api/Collection.html) object corresponding to this collection from the [npm `mongodb` driver module](https://www.npmjs.com/package/mongodb) which is wrapped by `Mongo.Collection`.
     * @locus Server
     * @memberof Mongo.Collection
     * @instance
     */
    rawCollection() {
      var self = this;
      if (!self._collection.rawCollection) {
        throw new Error('Can only call rawCollection on server collections');
      }
      return self._collection.rawCollection();
    },
    /**
     * @summary Returns the [`Db`](http://mongodb.github.io/node-mongodb-native/3.0/api/Db.html) object corresponding to this collection's database connection from the [npm `mongodb` driver module](https://www.npmjs.com/package/mongodb) which is wrapped by `Mongo.Collection`.
     * @locus Server
     * @memberof Mongo.Collection
     * @instance
     */
    rawDatabase() {
      var self = this;
      if (!(self._driver.mongo && self._driver.mongo.db)) {
        throw new Error('Can only call rawDatabase on server collections');
      }
      return self._driver.mongo.db;
    }
  });

  // Convert the callback to not return a result if there is an error
  function wrapCallback(callback, convertResult) {
    return callback && function (error, result) {
      if (error) {
        callback(error);
      } else if (typeof convertResult === 'function') {
        callback(error, convertResult(result));
      } else {
        callback(error, result);
      }
    };
  }

  /**
   * @summary Create a Mongo-style `ObjectID`.  If you don't specify a `hexString`, the `ObjectID` will generated randomly (not using MongoDB's ID construction rules).
   * @locus Anywhere
   * @class
   * @param {String} [hexString] Optional.  The 24-character hexadecimal contents of the ObjectID to create
   */
  Mongo.ObjectID = MongoID.ObjectID;

  /**
   * @summary To create a cursor, use find. To access the documents in a cursor, use forEach, map, or fetch.
   * @class
   * @instanceName cursor
   */
  Mongo.Cursor = LocalCollection.Cursor;

  /**
   * @deprecated in 0.9.1
   */
  Mongo.Collection.Cursor = Mongo.Cursor;

  /**
   * @deprecated in 0.9.1
   */
  Mongo.Collection.ObjectID = Mongo.ObjectID;

  /**
   * @deprecated in 0.9.1
   */
  Meteor.Collection = Mongo.Collection;

  // Allow deny stuff is now in the allow-deny package
  Object.assign(Mongo.Collection.prototype, AllowDeny.CollectionPrototype);
  function popCallbackFromArgs(args) {
    // Pull off any callback (or perhaps a 'callback' variable that was passed
    // in undefined, like how 'upsert' does it).
    if (args.length && (args[args.length - 1] === undefined || args[args.length - 1] instanceof Function)) {
      return args.pop();
    }
  }
  ASYNC_COLLECTION_METHODS.forEach(methodName => {
    const methodNameAsync = getAsyncMethodName(methodName);
    Mongo.Collection.prototype[methodNameAsync] = function () {
      try {
        // TODO: Fibers remove this when we remove fibers.
        this[methodName].isCalledFromAsync = true;
        return Promise.resolve(this[methodName](...arguments));
      } catch (error) {
        return Promise.reject(error);
      }
    };
  });
}.call(this, module);
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"connection_options.js":function module(){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/mongo/connection_options.js                                                                                //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
/**
 * @summary Allows for user specified connection options
 * @example http://mongodb.github.io/node-mongodb-native/3.0/reference/connecting/connection-settings/
 * @locus Server
 * @param {Object} options User specified Mongo connection options
 */
Mongo.setConnectionOptions = function setConnectionOptions(options) {
  check(options, Object);
  Mongo._connectionOptions = options;
};
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"mongo_utils.js":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/mongo/mongo_utils.js                                                                                       //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
const _excluded = ["fields", "projection"];
let _objectSpread;
module.link("@babel/runtime/helpers/objectSpread2", {
  default(v) {
    _objectSpread = v;
  }
}, 0);
let _objectWithoutProperties;
module.link("@babel/runtime/helpers/objectWithoutProperties", {
  default(v) {
    _objectWithoutProperties = v;
  }
}, 1);
module.export({
  normalizeProjection: () => normalizeProjection
});
const normalizeProjection = options => {
  // transform fields key in projection
  const _ref = options || {},
    {
      fields,
      projection
    } = _ref,
    otherOptions = _objectWithoutProperties(_ref, _excluded);
  // TODO: enable this comment when deprecating the fields option
  // Log.debug(`fields option has been deprecated, please use the new 'projection' instead`)

  return _objectSpread(_objectSpread({}, otherOptions), projection || fields ? {
    projection: fields || projection
  } : {});
};
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}}}}},{
  "extensions": [
    ".js",
    ".json"
  ]
});

require("/node_modules/meteor/mongo/mongo_driver.js");
require("/node_modules/meteor/mongo/oplog_tailing.js");
require("/node_modules/meteor/mongo/observe_multiplex.js");
require("/node_modules/meteor/mongo/doc_fetcher.js");
require("/node_modules/meteor/mongo/polling_observe_driver.js");
require("/node_modules/meteor/mongo/oplog_observe_driver.js");
require("/node_modules/meteor/mongo/oplog_v2_converter.js");
require("/node_modules/meteor/mongo/local_collection_driver.js");
require("/node_modules/meteor/mongo/remote_collection_driver.js");
require("/node_modules/meteor/mongo/collection.js");
require("/node_modules/meteor/mongo/connection_options.js");

/* Exports */
Package._define("mongo", {
  MongoInternals: MongoInternals,
  Mongo: Mongo,
  ObserveMultiplexer: ObserveMultiplexer
});

})();

//# sourceURL=meteor://💻app/packages/mongo.js
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm1ldGVvcjovL/CfkrthcHAvcGFja2FnZXMvbW9uZ28vbW9uZ29fZHJpdmVyLmpzIiwibWV0ZW9yOi8v8J+Su2FwcC9wYWNrYWdlcy9tb25nby9vcGxvZ190YWlsaW5nLmpzIiwibWV0ZW9yOi8v8J+Su2FwcC9wYWNrYWdlcy9tb25nby9vYnNlcnZlX211bHRpcGxleC5qcyIsIm1ldGVvcjovL/CfkrthcHAvcGFja2FnZXMvbW9uZ28vZG9jX2ZldGNoZXIuanMiLCJtZXRlb3I6Ly/wn5K7YXBwL3BhY2thZ2VzL21vbmdvL3BvbGxpbmdfb2JzZXJ2ZV9kcml2ZXIuanMiLCJtZXRlb3I6Ly/wn5K7YXBwL3BhY2thZ2VzL21vbmdvL29wbG9nX29ic2VydmVfZHJpdmVyLmpzIiwibWV0ZW9yOi8v8J+Su2FwcC9wYWNrYWdlcy9tb25nby9vcGxvZ192Ml9jb252ZXJ0ZXIuanMiLCJtZXRlb3I6Ly/wn5K7YXBwL3BhY2thZ2VzL21vbmdvL2xvY2FsX2NvbGxlY3Rpb25fZHJpdmVyLmpzIiwibWV0ZW9yOi8v8J+Su2FwcC9wYWNrYWdlcy9tb25nby9yZW1vdGVfY29sbGVjdGlvbl9kcml2ZXIuanMiLCJtZXRlb3I6Ly/wn5K7YXBwL3BhY2thZ2VzL21vbmdvL2NvbGxlY3Rpb24uanMiLCJtZXRlb3I6Ly/wn5K7YXBwL3BhY2thZ2VzL21vbmdvL2Nvbm5lY3Rpb25fb3B0aW9ucy5qcyIsIm1ldGVvcjovL/CfkrthcHAvcGFja2FnZXMvbW9uZ28vbW9uZ29fdXRpbHMuanMiXSwibmFtZXMiOlsiX29iamVjdFNwcmVhZCIsIm1vZHVsZTEiLCJsaW5rIiwiZGVmYXVsdCIsInYiLCJub3JtYWxpemVQcm9qZWN0aW9uIiwiRG9jRmV0Y2hlciIsIkFTWU5DX0NVUlNPUl9NRVRIT0RTIiwiZ2V0QXN5bmNNZXRob2ROYW1lIiwicGF0aCIsInJlcXVpcmUiLCJ1dGlsIiwiTW9uZ29EQiIsIk5wbU1vZHVsZU1vbmdvZGIiLCJGdXR1cmUiLCJOcG0iLCJNb25nb0ludGVybmFscyIsIk5wbU1vZHVsZXMiLCJtb25nb2RiIiwidmVyc2lvbiIsIk5wbU1vZHVsZU1vbmdvZGJWZXJzaW9uIiwibW9kdWxlIiwiTnBtTW9kdWxlIiwiRklMRV9BU1NFVF9TVUZGSVgiLCJBU1NFVFNfRk9MREVSIiwiQVBQX0ZPTERFUiIsInJlcGxhY2VOYW1lcyIsImZpbHRlciIsInRoaW5nIiwiXyIsImlzQXJyYXkiLCJtYXAiLCJiaW5kIiwicmV0IiwiZWFjaCIsInZhbHVlIiwia2V5IiwiVGltZXN0YW1wIiwicHJvdG90eXBlIiwiY2xvbmUiLCJtYWtlTW9uZ29MZWdhbCIsIm5hbWUiLCJ1bm1ha2VNb25nb0xlZ2FsIiwic3Vic3RyIiwicmVwbGFjZU1vbmdvQXRvbVdpdGhNZXRlb3IiLCJkb2N1bWVudCIsIkJpbmFyeSIsInN1Yl90eXBlIiwiYnVmZmVyIiwiVWludDhBcnJheSIsIk9iamVjdElEIiwiTW9uZ28iLCJ0b0hleFN0cmluZyIsIkRlY2ltYWwxMjgiLCJEZWNpbWFsIiwidG9TdHJpbmciLCJzaXplIiwiRUpTT04iLCJmcm9tSlNPTlZhbHVlIiwidW5kZWZpbmVkIiwicmVwbGFjZU1ldGVvckF0b21XaXRoTW9uZ28iLCJpc0JpbmFyeSIsIkJ1ZmZlciIsImZyb20iLCJmcm9tU3RyaW5nIiwiX2lzQ3VzdG9tVHlwZSIsInRvSlNPTlZhbHVlIiwicmVwbGFjZVR5cGVzIiwiYXRvbVRyYW5zZm9ybWVyIiwicmVwbGFjZWRUb3BMZXZlbEF0b20iLCJ2YWwiLCJ2YWxSZXBsYWNlZCIsIk1vbmdvQ29ubmVjdGlvbiIsInVybCIsIm9wdGlvbnMiLCJzZWxmIiwiX29ic2VydmVNdWx0aXBsZXhlcnMiLCJfb25GYWlsb3Zlckhvb2siLCJIb29rIiwidXNlck9wdGlvbnMiLCJfY29ubmVjdGlvbk9wdGlvbnMiLCJNZXRlb3IiLCJzZXR0aW5ncyIsInBhY2thZ2VzIiwibW9uZ28iLCJtb25nb09wdGlvbnMiLCJPYmplY3QiLCJhc3NpZ24iLCJpZ25vcmVVbmRlZmluZWQiLCJoYXMiLCJtYXhQb29sU2l6ZSIsImVudHJpZXMiLCJlbmRzV2l0aCIsImZvckVhY2giLCJvcHRpb25OYW1lIiwicmVwbGFjZSIsImpvaW4iLCJBc3NldHMiLCJnZXRTZXJ2ZXJEaXIiLCJkYiIsIl9vcGxvZ0hhbmRsZSIsIl9kb2NGZXRjaGVyIiwiY2xpZW50IiwiTW9uZ29DbGllbnQiLCJvbiIsImJpbmRFbnZpcm9ubWVudCIsImV2ZW50IiwicHJldmlvdXNEZXNjcmlwdGlvbiIsInR5cGUiLCJuZXdEZXNjcmlwdGlvbiIsImNhbGxiYWNrIiwib3Bsb2dVcmwiLCJQYWNrYWdlIiwiT3Bsb2dIYW5kbGUiLCJkYXRhYmFzZU5hbWUiLCJQcm9taXNlIiwiYXdhaXQiLCJjb25uZWN0IiwiY2xvc2UiLCJFcnJvciIsIm9wbG9nSGFuZGxlIiwic3RvcCIsIndyYXAiLCJ3YWl0IiwicmF3Q29sbGVjdGlvbiIsImNvbGxlY3Rpb25OYW1lIiwiY29sbGVjdGlvbiIsIl9jcmVhdGVDYXBwZWRDb2xsZWN0aW9uIiwiYnl0ZVNpemUiLCJtYXhEb2N1bWVudHMiLCJmdXR1cmUiLCJjcmVhdGVDb2xsZWN0aW9uIiwiY2FwcGVkIiwibWF4IiwicmVzb2x2ZXIiLCJfbWF5YmVCZWdpbldyaXRlIiwiZmVuY2UiLCJERFBTZXJ2ZXIiLCJfQ3VycmVudFdyaXRlRmVuY2UiLCJnZXQiLCJiZWdpbldyaXRlIiwiY29tbWl0dGVkIiwiX29uRmFpbG92ZXIiLCJyZWdpc3RlciIsIndyaXRlQ2FsbGJhY2siLCJ3cml0ZSIsInJlZnJlc2giLCJlcnIiLCJyZXN1bHQiLCJyZWZyZXNoRXJyIiwiYmluZEVudmlyb25tZW50Rm9yV3JpdGUiLCJfaW5zZXJ0IiwiY29sbGVjdGlvbl9uYW1lIiwic2VuZEVycm9yIiwiZSIsIl9leHBlY3RlZEJ5VGVzdCIsIkxvY2FsQ29sbGVjdGlvbiIsIl9pc1BsYWluT2JqZWN0IiwiaWQiLCJfaWQiLCJpbnNlcnRPbmUiLCJzYWZlIiwidGhlbiIsImluc2VydGVkSWQiLCJjYXRjaCIsIl9yZWZyZXNoIiwic2VsZWN0b3IiLCJyZWZyZXNoS2V5Iiwic3BlY2lmaWNJZHMiLCJfaWRzTWF0Y2hlZEJ5U2VsZWN0b3IiLCJleHRlbmQiLCJfcmVtb3ZlIiwiZGVsZXRlTWFueSIsImRlbGV0ZWRDb3VudCIsInRyYW5zZm9ybVJlc3VsdCIsIm1vZGlmaWVkQ291bnQiLCJudW1iZXJBZmZlY3RlZCIsIl9kcm9wQ29sbGVjdGlvbiIsImNiIiwiZHJvcENvbGxlY3Rpb24iLCJkcm9wIiwiX2Ryb3BEYXRhYmFzZSIsImRyb3BEYXRhYmFzZSIsIl91cGRhdGUiLCJtb2QiLCJGdW5jdGlvbiIsIm1vbmdvT3B0cyIsImFycmF5RmlsdGVycyIsInVwc2VydCIsIm11bHRpIiwiZnVsbFJlc3VsdCIsIm1vbmdvU2VsZWN0b3IiLCJtb25nb01vZCIsImlzTW9kaWZ5IiwiX2lzTW9kaWZpY2F0aW9uTW9kIiwiX2ZvcmJpZFJlcGxhY2UiLCJrbm93bklkIiwibmV3RG9jIiwiX2NyZWF0ZVVwc2VydERvY3VtZW50IiwiZ2VuZXJhdGVkSWQiLCJzaW11bGF0ZVVwc2VydFdpdGhJbnNlcnRlZElkIiwiZXJyb3IiLCJfcmV0dXJuT2JqZWN0IiwiaGFzT3duUHJvcGVydHkiLCIkc2V0T25JbnNlcnQiLCJzdHJpbmdzIiwia2V5cyIsInN0YXJ0c1dpdGgiLCJ1cGRhdGVNZXRob2QiLCJsZW5ndGgiLCJtZXRlb3JSZXN1bHQiLCJkcml2ZXJSZXN1bHQiLCJtb25nb1Jlc3VsdCIsInVwc2VydGVkQ291bnQiLCJ1cHNlcnRlZElkIiwibiIsIm1hdGNoZWRDb3VudCIsIk5VTV9PUFRJTUlTVElDX1RSSUVTIiwiX2lzQ2Fubm90Q2hhbmdlSWRFcnJvciIsImVycm1zZyIsImluZGV4T2YiLCJtb25nb09wdHNGb3JVcGRhdGUiLCJtb25nb09wdHNGb3JJbnNlcnQiLCJyZXBsYWNlbWVudFdpdGhJZCIsInRyaWVzIiwiZG9VcGRhdGUiLCJtZXRob2QiLCJ1cGRhdGVNYW55Iiwic29tZSIsInJlcGxhY2VPbmUiLCJkb0NvbmRpdGlvbmFsSW5zZXJ0Iiwid3JhcEFzeW5jIiwiYXBwbHkiLCJhcmd1bWVudHMiLCJ1cGRhdGUiLCJmaW5kIiwiQ3Vyc29yIiwiQ3Vyc29yRGVzY3JpcHRpb24iLCJmaW5kT25lQXN5bmMiLCJsaW1pdCIsImZldGNoQXN5bmMiLCJmaW5kT25lIiwiZnJvbVByb21pc2UiLCJjcmVhdGVJbmRleEFzeW5jIiwiaW5kZXgiLCJjcmVhdGVJbmRleCIsImNvdW50RG9jdW1lbnRzIiwiYXJncyIsImFyZyIsImVzdGltYXRlZERvY3VtZW50Q291bnQiLCJfZW5zdXJlSW5kZXgiLCJfZHJvcEluZGV4IiwiaW5kZXhOYW1lIiwiZHJvcEluZGV4IiwiQ29sbGVjdGlvbiIsIl9yZXdyaXRlU2VsZWN0b3IiLCJjdXJzb3JEZXNjcmlwdGlvbiIsIl9tb25nbyIsIl9jdXJzb3JEZXNjcmlwdGlvbiIsIl9zeW5jaHJvbm91c0N1cnNvciIsInNldHVwU3luY2hyb25vdXNDdXJzb3IiLCJjdXJzb3IiLCJ0YWlsYWJsZSIsIl9jcmVhdGVTeW5jaHJvbm91c0N1cnNvciIsInNlbGZGb3JJdGVyYXRpb24iLCJ1c2VUcmFuc2Zvcm0iLCJjb3VudCIsIlN5bWJvbCIsIml0ZXJhdG9yIiwiYXN5bmNJdGVyYXRvciIsIm1ldGhvZE5hbWUiLCJtZXRob2ROYW1lQXN5bmMiLCJpc0NhbGxlZEZyb21Bc3luYyIsInJlc29sdmUiLCJyZWplY3QiLCJnZXRUcmFuc2Zvcm0iLCJ0cmFuc2Zvcm0iLCJfcHVibGlzaEN1cnNvciIsInN1YiIsIl9nZXRDb2xsZWN0aW9uTmFtZSIsIm9ic2VydmUiLCJjYWxsYmFja3MiLCJfb2JzZXJ2ZUZyb21PYnNlcnZlQ2hhbmdlcyIsIm9ic2VydmVDaGFuZ2VzIiwibWV0aG9kcyIsIm9yZGVyZWQiLCJfb2JzZXJ2ZUNoYW5nZXNDYWxsYmFja3NBcmVPcmRlcmVkIiwiZXhjZXB0aW9uTmFtZSIsIl9mcm9tT2JzZXJ2ZSIsIl9vYnNlcnZlQ2hhbmdlcyIsIm5vbk11dGF0aW5nQ2FsbGJhY2tzIiwicGljayIsImN1cnNvck9wdGlvbnMiLCJzb3J0Iiwic2tpcCIsInByb2plY3Rpb24iLCJmaWVsZHMiLCJyZWFkUHJlZmVyZW5jZSIsIm51bWJlck9mUmV0cmllcyIsImRiQ3Vyc29yIiwiYWRkQ3Vyc29yRmxhZyIsIk9QTE9HX0NPTExFQ1RJT04iLCJ0cyIsIm1heFRpbWVNcyIsIm1heFRpbWVNUyIsImhpbnQiLCJTeW5jaHJvbm91c0N1cnNvciIsIl9kYkN1cnNvciIsIl9zZWxmRm9ySXRlcmF0aW9uIiwiX3RyYW5zZm9ybSIsIndyYXBUcmFuc2Zvcm0iLCJfc3luY2hyb25vdXNDb3VudCIsIl92aXNpdGVkSWRzIiwiX0lkTWFwIiwiX3Jhd05leHRPYmplY3RQcm9taXNlIiwibmV4dCIsImRvYyIsIl9uZXh0T2JqZWN0UHJvbWlzZSIsInNldCIsIl9uZXh0T2JqZWN0UHJvbWlzZVdpdGhUaW1lb3V0IiwidGltZW91dE1TIiwibmV4dE9iamVjdFByb21pc2UiLCJ0aW1lb3V0RXJyIiwidGltZW91dFByb21pc2UiLCJ0aW1lciIsInNldFRpbWVvdXQiLCJyYWNlIiwiX25leHRPYmplY3QiLCJ0aGlzQXJnIiwid3JhcHBlZEZuIiwid3JhcEZuIiwiX3Jld2luZCIsImNhbGwiLCJyZXMiLCJwdXNoIiwicmV3aW5kIiwiZmV0Y2giLCJpZGVudGl0eSIsImdldFJhd09iamVjdHMiLCJyZXN1bHRzIiwiZG9uZSIsInN5bmNSZXN1bHQiLCJ0YWlsIiwiZG9jQ2FsbGJhY2siLCJzdG9wcGVkIiwibGFzdFRTIiwibG9vcCIsIm5ld1NlbGVjdG9yIiwiJGd0IiwiZGVmZXIiLCJfb2JzZXJ2ZUNoYW5nZXNUYWlsYWJsZSIsImZpZWxkc09wdGlvbnMiLCJvYnNlcnZlS2V5Iiwic3RyaW5naWZ5IiwibXVsdGlwbGV4ZXIiLCJvYnNlcnZlRHJpdmVyIiwiZmlyc3RIYW5kbGUiLCJfbm9ZaWVsZHNBbGxvd2VkIiwiT2JzZXJ2ZU11bHRpcGxleGVyIiwib25TdG9wIiwib2JzZXJ2ZUhhbmRsZSIsIk9ic2VydmVIYW5kbGUiLCJtYXRjaGVyIiwic29ydGVyIiwiY2FuVXNlT3Bsb2ciLCJhbGwiLCJfdGVzdE9ubHlQb2xsQ2FsbGJhY2siLCJNaW5pbW9uZ28iLCJNYXRjaGVyIiwiT3Bsb2dPYnNlcnZlRHJpdmVyIiwiY3Vyc29yU3VwcG9ydGVkIiwiU29ydGVyIiwiZiIsImRyaXZlckNsYXNzIiwiUG9sbGluZ09ic2VydmVEcml2ZXIiLCJtb25nb0hhbmRsZSIsIl9vYnNlcnZlRHJpdmVyIiwiYWRkSGFuZGxlQW5kU2VuZEluaXRpYWxBZGRzIiwibGlzdGVuQWxsIiwibGlzdGVuQ2FsbGJhY2siLCJsaXN0ZW5lcnMiLCJmb3JFYWNoVHJpZ2dlciIsInRyaWdnZXIiLCJfSW52YWxpZGF0aW9uQ3Jvc3NiYXIiLCJsaXN0ZW4iLCJsaXN0ZW5lciIsInRyaWdnZXJDYWxsYmFjayIsImFkZGVkQmVmb3JlIiwiYWRkZWQiLCJNb25nb1RpbWVzdGFtcCIsIkNvbm5lY3Rpb24iLCJMb25nIiwiVE9PX0ZBUl9CRUhJTkQiLCJwcm9jZXNzIiwiZW52IiwiTUVURU9SX09QTE9HX1RPT19GQVJfQkVISU5EIiwiVEFJTF9USU1FT1VUIiwiTUVURU9SX09QTE9HX1RBSUxfVElNRU9VVCIsInNob3dUUyIsImdldEhpZ2hCaXRzIiwiZ2V0TG93Qml0cyIsImlkRm9yT3AiLCJvcCIsIm8iLCJvMiIsImRiTmFtZSIsIl9vcGxvZ1VybCIsIl9kYk5hbWUiLCJfb3Bsb2dMYXN0RW50cnlDb25uZWN0aW9uIiwiX29wbG9nVGFpbENvbm5lY3Rpb24iLCJfc3RvcHBlZCIsIl90YWlsSGFuZGxlIiwiX3JlYWR5RnV0dXJlIiwiX2Nyb3NzYmFyIiwiX0Nyb3NzYmFyIiwiZmFjdFBhY2thZ2UiLCJmYWN0TmFtZSIsIl9iYXNlT3Bsb2dTZWxlY3RvciIsIm5zIiwiUmVnRXhwIiwiX2VzY2FwZVJlZ0V4cCIsIiRvciIsIiRpbiIsIiRleGlzdHMiLCJfY2F0Y2hpbmdVcEZ1dHVyZXMiLCJfbGFzdFByb2Nlc3NlZFRTIiwiX29uU2tpcHBlZEVudHJpZXNIb29rIiwiZGVidWdQcmludEV4Y2VwdGlvbnMiLCJfZW50cnlRdWV1ZSIsIl9Eb3VibGVFbmRlZFF1ZXVlIiwiX3dvcmtlckFjdGl2ZSIsIl9zdGFydFRhaWxpbmciLCJvbk9wbG9nRW50cnkiLCJvcmlnaW5hbENhbGxiYWNrIiwibm90aWZpY2F0aW9uIiwiX2RlYnVnIiwibGlzdGVuSGFuZGxlIiwib25Ta2lwcGVkRW50cmllcyIsIndhaXRVbnRpbENhdWdodFVwIiwibGFzdEVudHJ5IiwiJG5hdHVyYWwiLCJfc2xlZXBGb3JNcyIsImxlc3NUaGFuT3JFcXVhbCIsImluc2VydEFmdGVyIiwiZ3JlYXRlclRoYW4iLCJzcGxpY2UiLCJtb25nb2RiVXJpIiwicGFyc2UiLCJkYXRhYmFzZSIsImFkbWluIiwiY29tbWFuZCIsImlzbWFzdGVyIiwiaXNNYXN0ZXJEb2MiLCJzZXROYW1lIiwibGFzdE9wbG9nRW50cnkiLCJvcGxvZ1NlbGVjdG9yIiwiX21heWJlU3RhcnRXb3JrZXIiLCJyZXR1cm4iLCJoYW5kbGVEb2MiLCJhcHBseU9wcyIsIm5leHRUaW1lc3RhbXAiLCJhZGQiLCJPTkUiLCJzbGljZSIsImZpcmUiLCJpc0VtcHR5IiwicG9wIiwiY2xlYXIiLCJfc2V0TGFzdFByb2Nlc3NlZFRTIiwic2hpZnQiLCJzZXF1ZW5jZXIiLCJfZGVmaW5lVG9vRmFyQmVoaW5kIiwiX3Jlc2V0VG9vRmFyQmVoaW5kIiwiX29iamVjdFdpdGhvdXRQcm9wZXJ0aWVzIiwiRmFjdHMiLCJpbmNyZW1lbnRTZXJ2ZXJGYWN0IiwiX29yZGVyZWQiLCJfb25TdG9wIiwiX3F1ZXVlIiwiX1N5bmNocm9ub3VzUXVldWUiLCJfaGFuZGxlcyIsIl9jYWNoZSIsIl9DYWNoaW5nQ2hhbmdlT2JzZXJ2ZXIiLCJfYWRkSGFuZGxlVGFza3NTY2hlZHVsZWRCdXROb3RQZXJmb3JtZWQiLCJjYWxsYmFja05hbWVzIiwiY2FsbGJhY2tOYW1lIiwiX2FwcGx5Q2FsbGJhY2siLCJ0b0FycmF5IiwiaGFuZGxlIiwic2FmZVRvUnVuVGFzayIsInJ1blRhc2siLCJfc2VuZEFkZHMiLCJyZW1vdmVIYW5kbGUiLCJfcmVhZHkiLCJfc3RvcCIsImZyb21RdWVyeUVycm9yIiwicmVhZHkiLCJxdWV1ZVRhc2siLCJxdWVyeUVycm9yIiwidGhyb3ciLCJvbkZsdXNoIiwiaXNSZXNvbHZlZCIsImFwcGx5Q2hhbmdlIiwiaGFuZGxlSWQiLCJfYWRkZWRCZWZvcmUiLCJfYWRkZWQiLCJkb2NzIiwibmV4dE9ic2VydmVIYW5kbGVJZCIsIl9tdWx0aXBsZXhlciIsImJlZm9yZSIsImV4cG9ydCIsIkZpYmVyIiwiY29uc3RydWN0b3IiLCJtb25nb0Nvbm5lY3Rpb24iLCJfbW9uZ29Db25uZWN0aW9uIiwiX2NhbGxiYWNrc0Zvck9wIiwiTWFwIiwiY2hlY2siLCJTdHJpbmciLCJkZWxldGUiLCJydW4iLCJQT0xMSU5HX1RIUk9UVExFX01TIiwiTUVURU9SX1BPTExJTkdfVEhST1RUTEVfTVMiLCJQT0xMSU5HX0lOVEVSVkFMX01TIiwiTUVURU9SX1BPTExJTkdfSU5URVJWQUxfTVMiLCJfbW9uZ29IYW5kbGUiLCJfc3RvcENhbGxiYWNrcyIsIl9yZXN1bHRzIiwiX3BvbGxzU2NoZWR1bGVkQnV0Tm90U3RhcnRlZCIsIl9wZW5kaW5nV3JpdGVzIiwiX2Vuc3VyZVBvbGxJc1NjaGVkdWxlZCIsInRocm90dGxlIiwiX3VudGhyb3R0bGVkRW5zdXJlUG9sbElzU2NoZWR1bGVkIiwicG9sbGluZ1Rocm90dGxlTXMiLCJfdGFza1F1ZXVlIiwibGlzdGVuZXJzSGFuZGxlIiwicG9sbGluZ0ludGVydmFsIiwicG9sbGluZ0ludGVydmFsTXMiLCJfcG9sbGluZ0ludGVydmFsIiwiaW50ZXJ2YWxIYW5kbGUiLCJzZXRJbnRlcnZhbCIsImNsZWFySW50ZXJ2YWwiLCJfcG9sbE1vbmdvIiwiX3N1c3BlbmRQb2xsaW5nIiwiX3Jlc3VtZVBvbGxpbmciLCJmaXJzdCIsIm5ld1Jlc3VsdHMiLCJvbGRSZXN1bHRzIiwid3JpdGVzRm9yQ3ljbGUiLCJjb2RlIiwiSlNPTiIsIm1lc3NhZ2UiLCJBcnJheSIsIl9kaWZmUXVlcnlDaGFuZ2VzIiwidyIsImMiLCJvcGxvZ1YyVjFDb252ZXJ0ZXIiLCJQSEFTRSIsIlFVRVJZSU5HIiwiRkVUQ0hJTkciLCJTVEVBRFkiLCJTd2l0Y2hlZFRvUXVlcnkiLCJmaW5pc2hJZk5lZWRUb1BvbGxRdWVyeSIsImN1cnJlbnRJZCIsIl91c2VzT3Bsb2ciLCJjb21wYXJhdG9yIiwiZ2V0Q29tcGFyYXRvciIsImhlYXBPcHRpb25zIiwiSWRNYXAiLCJfbGltaXQiLCJfY29tcGFyYXRvciIsIl9zb3J0ZXIiLCJfdW5wdWJsaXNoZWRCdWZmZXIiLCJNaW5NYXhIZWFwIiwiX3B1Ymxpc2hlZCIsIk1heEhlYXAiLCJfc2FmZUFwcGVuZFRvQnVmZmVyIiwiX3N0b3BIYW5kbGVzIiwiX3JlZ2lzdGVyUGhhc2VDaGFuZ2UiLCJfbWF0Y2hlciIsIl9wcm9qZWN0aW9uRm4iLCJfY29tcGlsZVByb2plY3Rpb24iLCJfc2hhcmVkUHJvamVjdGlvbiIsImNvbWJpbmVJbnRvUHJvamVjdGlvbiIsIl9zaGFyZWRQcm9qZWN0aW9uRm4iLCJfbmVlZFRvRmV0Y2giLCJfY3VycmVudGx5RmV0Y2hpbmciLCJfZmV0Y2hHZW5lcmF0aW9uIiwiX3JlcXVlcnlXaGVuRG9uZVRoaXNRdWVyeSIsIl93cml0ZXNUb0NvbW1pdFdoZW5XZVJlYWNoU3RlYWR5IiwiX25lZWRUb1BvbGxRdWVyeSIsIl9waGFzZSIsIl9oYW5kbGVPcGxvZ0VudHJ5UXVlcnlpbmciLCJfaGFuZGxlT3Bsb2dFbnRyeVN0ZWFkeU9yRmV0Y2hpbmciLCJmaXJlZCIsIl9vcGxvZ09ic2VydmVEcml2ZXJzIiwib25CZWZvcmVGaXJlIiwiZHJpdmVycyIsImRyaXZlciIsIl9ydW5Jbml0aWFsUXVlcnkiLCJfYWRkUHVibGlzaGVkIiwib3ZlcmZsb3dpbmdEb2NJZCIsIm1heEVsZW1lbnRJZCIsIm92ZXJmbG93aW5nRG9jIiwiZXF1YWxzIiwicmVtb3ZlIiwicmVtb3ZlZCIsIl9hZGRCdWZmZXJlZCIsIl9yZW1vdmVQdWJsaXNoZWQiLCJlbXB0eSIsIm5ld0RvY0lkIiwibWluRWxlbWVudElkIiwiX3JlbW92ZUJ1ZmZlcmVkIiwiX2NoYW5nZVB1Ymxpc2hlZCIsIm9sZERvYyIsInByb2plY3RlZE5ldyIsInByb2plY3RlZE9sZCIsImNoYW5nZWQiLCJEaWZmU2VxdWVuY2UiLCJtYWtlQ2hhbmdlZEZpZWxkcyIsIm1heEJ1ZmZlcmVkSWQiLCJfYWRkTWF0Y2hpbmciLCJtYXhQdWJsaXNoZWQiLCJtYXhCdWZmZXJlZCIsInRvUHVibGlzaCIsImNhbkFwcGVuZFRvQnVmZmVyIiwiY2FuSW5zZXJ0SW50b0J1ZmZlciIsInRvQnVmZmVyIiwiX3JlbW92ZU1hdGNoaW5nIiwiX2hhbmRsZURvYyIsIm1hdGNoZXNOb3ciLCJkb2N1bWVudE1hdGNoZXMiLCJwdWJsaXNoZWRCZWZvcmUiLCJidWZmZXJlZEJlZm9yZSIsImNhY2hlZEJlZm9yZSIsIm1pbkJ1ZmZlcmVkIiwic3RheXNJblB1Ymxpc2hlZCIsInN0YXlzSW5CdWZmZXIiLCJfZmV0Y2hNb2RpZmllZERvY3VtZW50cyIsInRoaXNHZW5lcmF0aW9uIiwid2FpdGluZyIsImZ1dCIsIl9iZVN0ZWFkeSIsIndyaXRlcyIsImlzUmVwbGFjZSIsImNhbkRpcmVjdGx5TW9kaWZ5RG9jIiwibW9kaWZpZXJDYW5CZURpcmVjdGx5QXBwbGllZCIsIl9tb2RpZnkiLCJjYW5CZWNvbWVUcnVlQnlNb2RpZmllciIsImFmZmVjdGVkQnlNb2RpZmllciIsIl9ydW5RdWVyeSIsImluaXRpYWwiLCJfZG9uZVF1ZXJ5aW5nIiwiX3BvbGxRdWVyeSIsIm5ld0J1ZmZlciIsIl9jdXJzb3JGb3JRdWVyeSIsImkiLCJfcHVibGlzaE5ld1Jlc3VsdHMiLCJvcHRpb25zT3ZlcndyaXRlIiwiZGVzY3JpcHRpb24iLCJpZHNUb1JlbW92ZSIsIl9vcGxvZ0VudHJ5SGFuZGxlIiwiX2xpc3RlbmVyc0hhbmRsZSIsInBoYXNlIiwibm93IiwiRGF0ZSIsInRpbWVEaWZmIiwiX3BoYXNlU3RhcnRUaW1lIiwiZGlzYWJsZU9wbG9nIiwiX2Rpc2FibGVPcGxvZyIsIl9jaGVja1N1cHBvcnRlZFByb2plY3Rpb24iLCJoYXNXaGVyZSIsImhhc0dlb1F1ZXJ5IiwibW9kaWZpZXIiLCJvcGVyYXRpb24iLCJmaWVsZCIsInRlc3QiLCJwcmVmaXgiLCJhcnJheU9wZXJhdG9yS2V5UmVnZXgiLCJpc0FycmF5T3BlcmF0b3JLZXkiLCJpc0FycmF5T3BlcmF0b3IiLCJvcGVyYXRvciIsImEiLCJldmVyeSIsImZsYXR0ZW5PYmplY3RJbnRvIiwidGFyZ2V0Iiwic291cmNlIiwibG9nRGVidWdNZXNzYWdlcyIsIk9QTE9HX0NPTlZFUlRFUl9ERUJVRyIsImNvbnZlcnRPcGxvZ0RpZmYiLCJvcGxvZ0VudHJ5IiwiZGlmZiIsImNvbnNvbGUiLCJsb2ciLCJkaWZmS2V5IiwiJHVuc2V0IiwiJHNldCIsInBvc2l0aW9uIiwicG9zaXRpb25LZXkiLCIkdiIsImNvbnZlcnRlZE9wbG9nRW50cnkiLCJMb2NhbENvbGxlY3Rpb25Ecml2ZXIiLCJub0Nvbm5Db2xsZWN0aW9ucyIsImNyZWF0ZSIsIm9wZW4iLCJjb25uIiwiZW5zdXJlQ29sbGVjdGlvbiIsIl9tb25nb19saXZlZGF0YV9jb2xsZWN0aW9ucyIsImNvbGxlY3Rpb25zIiwiQVNZTkNfQ09MTEVDVElPTl9NRVRIT0RTIiwiUmVtb3RlQ29sbGVjdGlvbkRyaXZlciIsIm1vbmdvX3VybCIsIlJFTU9URV9DT0xMRUNUSU9OX01FVEhPRFMiLCJtIiwiaW5jbHVkZXMiLCJhc3luY01ldGhvZE5hbWUiLCJkZWZhdWx0UmVtb3RlQ29sbGVjdGlvbkRyaXZlciIsIm9uY2UiLCJjb25uZWN0aW9uT3B0aW9ucyIsIm1vbmdvVXJsIiwiTU9OR09fVVJMIiwiTU9OR09fT1BMT0dfVVJMIiwic3RhcnR1cCIsIndhcm5Vc2luZ09sZEFwaSIsIldBUk5fV0hFTl9VU0lOR19PTERfQVBJIiwid2FybiIsInRyYWNlIiwiY29ubmVjdGlvbiIsIm1hbmFnZXIiLCJpZEdlbmVyYXRpb24iLCJfZHJpdmVyIiwiX3ByZXZlbnRBdXRvcHVibGlzaCIsIl9tYWtlTmV3SUQiLCJzcmMiLCJERFAiLCJyYW5kb21TdHJlYW0iLCJSYW5kb20iLCJpbnNlY3VyZSIsImhleFN0cmluZyIsIl9jb25uZWN0aW9uIiwiaXNDbGllbnQiLCJzZXJ2ZXIiLCJfY29sbGVjdGlvbiIsIl9uYW1lIiwiX21heWJlU2V0VXBSZXBsaWNhdGlvbiIsImRlZmluZU11dGF0aW9uTWV0aG9kcyIsIl9kZWZpbmVNdXRhdGlvbk1ldGhvZHMiLCJ1c2VFeGlzdGluZyIsIl9zdXBwcmVzc1NhbWVOYW1lRXJyb3IiLCJhdXRvcHVibGlzaCIsInB1Ymxpc2giLCJpc19hdXRvIiwicmVnaXN0ZXJTdG9yZSIsIm9rIiwiYmVnaW5VcGRhdGUiLCJiYXRjaFNpemUiLCJyZXNldCIsInBhdXNlT2JzZXJ2ZXJzIiwibXNnIiwibW9uZ29JZCIsIk1vbmdvSUQiLCJpZFBhcnNlIiwiX2RvY3MiLCJfcmVmIiwiaW5zZXJ0IiwiZW5kVXBkYXRlIiwicmVzdW1lT2JzZXJ2ZXJzIiwic2F2ZU9yaWdpbmFscyIsInJldHJpZXZlT3JpZ2luYWxzIiwiZ2V0RG9jIiwiX2dldENvbGxlY3Rpb24iLCJfZ2V0RmluZFNlbGVjdG9yIiwiX2dldEZpbmRPcHRpb25zIiwibmV3T3B0aW9ucyIsIk1hdGNoIiwiT3B0aW9uYWwiLCJPYmplY3RJbmNsdWRpbmciLCJPbmVPZiIsIk51bWJlciIsImZhbGxiYWNrSWQiLCJfc2VsZWN0b3JJc0lkIiwiZ2V0UHJvdG90eXBlT2YiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3JzIiwiZ2VuZXJhdGVJZCIsIl9pc1JlbW90ZUNvbGxlY3Rpb24iLCJlbmNsb3NpbmciLCJfQ3VycmVudE1ldGhvZEludm9jYXRpb24iLCJjaG9vc2VSZXR1cm5WYWx1ZUZyb21Db2xsZWN0aW9uUmVzdWx0Iiwid3JhcHBlZENhbGxiYWNrIiwid3JhcENhbGxiYWNrIiwiX2NhbGxNdXRhdG9yTWV0aG9kIiwib3B0aW9uc0FuZENhbGxiYWNrIiwicG9wQ2FsbGJhY2tGcm9tQXJncyIsIkxvZyIsImRlYnVnIiwicmVDcmVhdGVJbmRleE9uT3B0aW9uTWlzbWF0Y2giLCJpbmZvIiwicmF3RGF0YWJhc2UiLCJjb252ZXJ0UmVzdWx0IiwiQWxsb3dEZW55IiwiQ29sbGVjdGlvblByb3RvdHlwZSIsInNldENvbm5lY3Rpb25PcHRpb25zIiwib3RoZXJPcHRpb25zIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztFQUFBLElBQUlBLGFBQWE7RUFBQ0MsT0FBTyxDQUFDQyxJQUFJLENBQUMsc0NBQXNDLEVBQUM7SUFBQ0MsT0FBTyxDQUFDQyxDQUFDLEVBQUM7TUFBQ0osYUFBYSxHQUFDSSxDQUFDO0lBQUE7RUFBQyxDQUFDLEVBQUMsQ0FBQyxDQUFDO0VBQXRHLElBQUlDLG1CQUFtQjtFQUFDSixPQUFPLENBQUNDLElBQUksQ0FBQyxlQUFlLEVBQUM7SUFBQ0csbUJBQW1CLENBQUNELENBQUMsRUFBQztNQUFDQyxtQkFBbUIsR0FBQ0QsQ0FBQztJQUFBO0VBQUMsQ0FBQyxFQUFDLENBQUMsQ0FBQztFQUFDLElBQUlFLFVBQVU7RUFBQ0wsT0FBTyxDQUFDQyxJQUFJLENBQUMsa0JBQWtCLEVBQUM7SUFBQ0ksVUFBVSxDQUFDRixDQUFDLEVBQUM7TUFBQ0UsVUFBVSxHQUFDRixDQUFDO0lBQUE7RUFBQyxDQUFDLEVBQUMsQ0FBQyxDQUFDO0VBQUMsSUFBSUcsb0JBQW9CLEVBQUNDLGtCQUFrQjtFQUFDUCxPQUFPLENBQUNDLElBQUksQ0FBQyw0QkFBNEIsRUFBQztJQUFDSyxvQkFBb0IsQ0FBQ0gsQ0FBQyxFQUFDO01BQUNHLG9CQUFvQixHQUFDSCxDQUFDO0lBQUEsQ0FBQztJQUFDSSxrQkFBa0IsQ0FBQ0osQ0FBQyxFQUFDO01BQUNJLGtCQUFrQixHQUFDSixDQUFDO0lBQUE7RUFBQyxDQUFDLEVBQUMsQ0FBQyxDQUFDO0VBRTlXO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0VBRUEsTUFBTUssSUFBSSxHQUFHQyxPQUFPLENBQUMsTUFBTSxDQUFDO0VBQzVCLE1BQU1DLElBQUksR0FBR0QsT0FB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T0FBTyxFQUFFO0VBQ25FMmIsS0FBSyxDQUFDM2IsT0FBTyxFQUFFWSxNQUFNLENBQUM7RUFDdEJuQyxLQUFLLENBQUM2QixrQkFBa0IsR0FBR04sT0FBTztBQUNwQyxDQUFDLEM7Ozs7Ozs7Ozs7OztBQ1RELElBQUkxRSxhQUFhO0FBQUNxQixNQUFNLENBQUNuQixJQUFJLENBQUMsc0NBQXNDLEVBQUM7RUFBQ0MsT0FBTyxDQUFDQyxDQUFDLEVBQUM7SUFBQ0osYUFBYSxHQUFDSSxDQUFDO0VBQUE7QUFBQyxDQUFDLEVBQUMsQ0FBQyxDQUFDO0FBQUMsSUFBSXFkLHdCQUF3QjtBQUFDcGMsTUFBTSxDQUFDbkIsSUFBSSxDQUFDLGdEQUFnRCxFQUFDO0VBQUNDLE9BQU8sQ0FBQ0MsQ0FBQyxFQUFDO0lBQUNxZCx3QkFBd0IsR0FBQ3JkLENBQUM7RUFBQTtBQUFDLENBQUMsRUFBQyxDQUFDLENBQUM7QUFBM09pQixNQUFNLENBQUN5ZSxNQUFNLENBQUM7RUFBQ3pmLG1CQUFtQixFQUFDLE1BQUlBO0FBQW1CLENBQUMsQ0FBQztBQUFyRCxNQUFNQSxtQkFBbUIsR0FBR3FFLE9BQU8sSUFBSTtFQUM1QztFQUNBLGFBQWdEQSxPQUFPLElBQUksQ0FBQyxDQUFDO0lBQXZEO01BQUU4TixNQUFNO01BQUVEO0lBQTRCLENBQUM7SUFBZDJmLFlBQVk7RUFDM0M7RUFDQTs7RUFFQSx1Q0FDS0EsWUFBWSxHQUNYM2YsVUFBVSxJQUFJQyxNQUFNLEdBQUc7SUFBRUQsVUFBVSxFQUFFQyxNQUFNLElBQUlEO0VBQVcsQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUV4RSxDQUFDLEMiLCJmaWxlIjoiL3BhY2thZ2VzL21vbmdvLmpzIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgbm9ybWFsaXplUHJvamVjdGlvbiB9IGZyb20gXCIuL21vbmdvX3V0aWxzXCI7XG5cbi8qKlxuICogUHJvdmlkZSBhIHN5bmNocm9ub3VzIENvbGxlY3Rpb24gQVBJIHVzaW5nIGZpYmVycywgYmFja2VkIGJ5XG4gKiBNb25nb0RCLiAgVGhpcyBpcyBvbmx5IGZvciB1c2Ugb24gdGhlIHNlcnZlciwgYW5kIG1vc3RseSBpZGVudGljYWxcbiAqIHRvIHRoZSBjbGllbnQgQVBJLlxuICpcbiAqIE5PVEU6IHRoZSBwdWJsaWMgQVBJIG1ldGhvZHMgbXVzdCBiZSBydW4gd2l0aGluIGEgZmliZXIuIElmIHlvdSBjYWxsXG4gKiB0aGVzZSBvdXRzaWRlIG9mIGEgZmliZXIgdGhleSB3aWxsIGV4cGxvZGUhXG4gKi9cblxuY29uc3QgcGF0aCA9IHJlcXVpcmUoXCJwYXRoXCIpO1xuY29uc3QgdXRpbCA9IHJlcXVpcmUoXCJ1dGlsXCIpO1xuXG4vKiogQHR5cGUge2ltcG9ydCgnbW9uZ29kYicpfSAqL1xudmFyIE1vbmdvREIgPSBOcG1Nb2R1bGVNb25nb2RiO1xudmFyIEZ1dHVyZSA9IE5wbS5yZXF1aXJlKCdmaWJlcnMvZnV0dXJlJyk7XG5pbXBvcnQgeyBEb2NGZXRjaGVyIH0gZnJvbSBcIi4vZG9jX2ZldGNoZXIuanNcIjtcbmltcG9ydCB7XG4gIEFTWU5DX0NVUlNPUl9NRVRIT0RTLFxuICBnZXRBc3luY01ldGhvZE5hbWVcbn0gZnJvbSBcIm1ldGVvci9taW5pbW9uZ28vY29uc3RhbnRzXCI7XG5cbk1vbmdvSW50ZXJuYWxzID0ge307XG5cbk1vbmdvSW50ZXJuYWxzLk5wbU1vZHVsZXMgPSB7XG4gIG1vbmdvZGI6IHtcbiAgICB2ZXJzaW9uOiBOcG1Nb2R1bGVNb25nb2RiVmVyc2lvbixcbiAgICBtb2R1bGU6IE1vbmdvREJcbiAgfVxufTtcblxuLy8gT2xkZXIgdmVyc2lvbiBvZiB3aGF0IGlzIG5vdyBhdmFpbGFibGUgdmlhXG4vLyBNb25nb0ludGVybmFscy5OcG1Nb2R1bGVzLm1vbmdvZGIubW9kdWxlLiAgSXQgd2FzIG5ldmVyIGRvY3VtZW50ZWQsIGJ1dFxuLy8gcGVvcGxlIGRvIHVzZSBpdC5cbi8vIFhYWCBDT01QQVQgV0lUSCAxLjAuMy4yXG5Nb25nb0ludGVybmFscy5OcG1Nb2R1bGUgPSBNb25nb0RCO1xuXG5jb25zdCBGSUxFX0FTU0VUX1NVRkZJWCA9ICdBc3NldCc7XG5jb25zdCBBU1NFVFNfRk9MREVSID0gJ2Fzc2V0cyc7XG5jb25zdCBBUFBfRk9MREVSID0gJ2FwcCc7XG5cbi8vIFRoaXMgaXMgdXNlZCB0byBhZGQgb3IgcmVtb3ZlIEVKU09OIGZyb20gdGhlIGJlZ2lubmluZyBvZiBldmVyeXRoaW5nIG5lc3RlZFxuLy8gaW5zaWRlIGFuIEVKU09OIGN1c3RvbSB0eXBlLiBJdCBzaG91bGQgb25seSBiZSBjYWxsZWQgb24gcHVyZSBKU09OIVxudmFyIHJlcGxhY2VOYW1lcyA9IGZ1bmN0aW9uIChmaWx0ZXIsIHRoaW5nKSB7XG4gIGlmICh0eXBlb2YgdGhpbmcgPT09IFwib2JqZWN0XCIgJiYgdGhpbmcgIT09IG51bGwpIHtcbiAgICBpZiAoXy5pc0FycmF5KHRoaW5nKSkge1xuICAgICAgcmV0dXJuIF8ubWFwKHRoaW5nLCBfLmJpbmQocmVwbGFjZU5hbWVzLCBudWxsLCBmaWx0ZXIpKTtcbiAgICB9XG4gICAgdmFyIHJldCA9IHt9O1xuICAgIF8uZWFjaCh0aGluZywgZnVuY3Rpb24gKHZhbHVlLCBrZXkpIHtcbiAgICAgIHJldFtmaWx0ZXIoa2V5KV0gPSByZXBsYWNlTmFtZXMoZmlsdGVyLCB2YWx1ZSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIHJldDtcbiAgfVxuICByZXR1cm4gdGhpbmc7XG59O1xuXG4vLyBFbnN1cmUgdGhhdCBFSlNPTi5jbG9uZSBrZWVwcyBhIFRpbWVzdGFtcCBhcyBhIFRpbWVzdGFtcCAoaW5zdGVhZCBvZiBqdXN0XG4vLyBkb2luZyBhIHN0cnVjdHVyYWwgY2xvbmUpLlxuLy8gWFhYIGhvdyBvayBpcyB0aGlzPyB3aGF0IGlmIHRoZXJlIGFyZSBtdWx0aXBsZSBjb3BpZXMgb2YgTW9uZ29EQiBsb2FkZWQ/XG5Nb25nb0RCLlRpbWVzdGFtcC5wcm90b3R5cGUuY2xvbmUgPSBmdW5jdGlvbiAoKSB7XG4gIC8vIFRpbWVzdGFtcHMgc2hvdWxkIGJlIGltbXV0YWJsZS5cbiAgcmV0dXJuIHRoaXM7XG59O1xuXG52YXIgbWFrZU1vbmdvTGVnYWwgPSBmdW5jdGlvbiAobmFtZSkgeyByZXR1cm4gXCJFSlNPTlwiICsgbmFtZTsgfTtcbnZhciB1bm1ha2VNb25nb0xlZ2FsID0gZnVuY3Rpb24gKG5hbWUpIHsgcmV0dXJuIG5hbWUuc3Vic3RyKDUpOyB9O1xuXG52YXIgcmVwbGFjZU1vbmdvQXRvbVdpdGhNZXRlb3IgPSBmdW5jdGlvbiAoZG9jdW1lbnQpIHtcbiAgaWYgKGRvY3VtZW50IGluc3RhbmNlb2YgTW9uZ29EQi5CaW5hcnkpIHtcbiAgICAvLyBmb3IgYmFja3dhcmRzIGNvbXBhdGliaWxpdHlcbiAgICBpZiAoZG9jdW1lbnQuc3ViX3R5cGUgIT09IDApIHtcbiAgICAgIHJldHVybiBkb2N1bWVudDtcbiAgICB9XG4gICAgdmFyIGJ1ZmZlciA9IGRvY3VtZW50LnZhbHVlKHRydWUpO1xuICAgIHJldHVybiBuZXcgVWludDhBcnJheShidWZmZXIpO1xuICB9XG4gIGlmIChkb2N1bWVudCBpbnN0YW5jZW9mIE1vbmdvREIuT2JqZWN0SUQpIHtcbiAgICByZXR1cm4gbmV3IE1vbmdvLk9iamVjdElEKGRvY3VtZW50LnRvSGV4U3RyaW5nKCkpO1xuICB9XG4gIGlmIChkb2N1bWVudCBpbnN0YW5jZW9mIE1vbmdvREIuRGVjaW1hbDEyOCkge1xuICAgIHJldHVybiBEZWNpbWFsKGRvY3VtZW50LnRvU3RyaW5nKCkpO1xuICB9XG4gIGlmIChkb2N1bWVudFtcIkVKU09OJHR5cGVcIl0gJiYgZG9jdW1lbnRbXCJFSlNPTiR2YWx1ZVwiXSAmJiBfLnNpemUoZG9jdW1lbnQpID09PSAyKSB7XG4gICAgcmV0dXJuIEVKU09OLmZyb21KU09OVmFsdWUocmVwbGFjZU5hbWVzKHVubWFrZU1vbmdvTGVnYWwsIGRvY3VtZW50KSk7XG4gIH1cbiAgaWYgKGRvY3VtZW50IGluc3RhbmNlb2YgTW9uZ29EQi5UaW1lc3RhbXApIHtcbiAgICAvLyBGb3Igbm93LCB0aGUgTWV0ZW9yIHJlcHJlc2VudGF0aW9uIG9mIGEgTW9uZ28gdGltZXN0YW1wIHR5cGUgKG5vdCBhIGRhdGUhXG4gICAgLy8gdGhpcyBpcyBhIHdlaXJkIGludGVybmFsIHRoaW5nIHVzZWQgaW4gdGhlIG9wbG9nISkgaXMgdGhlIHNhbWUgYXMgdGhlXG4gICAgLy8gTW9uZ28gcmVwcmVzZW50YXRpb24uIFdlIG5lZWQgdG8gZG8gdGhpcyBleHBsaWNpdGx5IG9yIGVsc2Ugd2Ugd291bGQgZG8gYVxuICAgIC8vIHN0cnVjdHVyYWwgY2xvbmUgYW5kIGxvc2UgdGhlIHByb3RvdHlwZS5cbiAgICByZXR1cm4gZG9jdW1lbnQ7XG4gIH1cbiAgcmV0dXJuIHVuZGVmaW5lZDtcbn07XG5cbnZhciByZXBsYWNlTWV0ZW9yQXRvbVdpdGhNb25nbyA9IGZ1bmN0aW9uIChkb2N1bWVudCkge1xuICBpZiAoRUpTT04uaXNCaW5hcnkoZG9jdW1lbnQpKSB7XG4gICAgLy8gVGhpcyBkb2VzIG1vcmUgY29waWVzIHRoYW4gd2UnZCBsaWtlLCBidXQgaXMgbmVjZXNzYXJ5IGJlY2F1c2VcbiAgICAvLyBNb25nb0RCLkJTT04gb25seSBsb29rcyBsaWtlIGl0IHRha2VzIGEgVWludDhBcnJheSAoYW5kIGRvZXNuJ3QgYWN0dWFsbHlcbiAgICAvLyBzZXJpYWxpemUgaXQgY29ycmVjdGx5KS5cbiAgICByZXR1cm4gbmV3IE1vbmdvREIuQmluYXJ5KEJ1ZmZlci5mcm9tKGRvY3VtZW50KSk7XG4gIH1cbiAgaWYgKGRvY3VtZW50IGluc3RhbmNlb2YgTW9uZ29EQi5CaW5hcnkpIHtcbiAgICAgcmV0dXJuIGRvY3VtZW50O1xuICB9XG4gIGlmIChkb2N1bWVudCBpbnN0YW5jZW9mIE1vbmdvLk9iamVjdElEKSB7XG4gICAgcmV0dXJuIG5ldyBNb25nb0RCLk9iamVjdElEKGRvY3VtZW50LnRvSGV4U3RyaW5nKCkpO1xuICB9XG4gIGlmIChkb2N1bWVudCBpbnN0YW5jZW9mIE1vbmdvREIuVGltZXN0YW1wKSB7XG4gICAgLy8gRm9yIG5vdywgdGhlIE1ldGVvciByZXByZXNlbnRhdGlvbiBvZiBhIE1vbmdvIHRpbWVzdGFtcCB0eXBlIChub3QgYSBkYXRlIVxuICAgIC8vIHRoaXMgaXMgYSB3ZWlyZCBpbnRlcm5hbCB0aGluZyB1c2VkIGluIHRoZSBvcGxvZyEpIGlzIHRoZSBzYW1lIGFzIHRoZVxuICAgIC8vIE1vbmdvIHJlcHJlc2VudGF0aW9uLiBXZSBuZWVkIHRvIGRvIHRoaXMgZXhwbGljaXRseSBvciBlbHNlIHdlIHdvdWxkIGRvIGFcbiAgICAvLyBzdHJ1Y3R1cmFsIGNsb25lIGFuZCBsb3NlIHRoZSBwcm90b3R5cGUuXG4gICAgcmV0dXJuIGRvY3VtZW50O1xuICB9XG4gIGlmIChkb2N1bWVudCBpbnN0YW5jZW9mIERlY2ltYWwpIHtcbiAgICByZXR1cm4gTW9uZ29EQi5EZWNpbWFsMTI4LmZyb21TdHJpbmcoZG9jdW1lbnQudG9TdHJpbmcoKSk7XG4gIH1cbiAgaWYgKEVKU09OLl9pc0N1c3RvbVR5cGUoZG9jdW1lbnQpKSB7XG4gICAgcmV0dXJuIHJlcGxhY2VOYW1lcyhtYWtlTW9uZ29MZWdhbCwgRUpTT04udG9KU09OVmFsdWUoZG9jdW1lbnQpKTtcbiAgfVxuICAvLyBJdCBpcyBub3Qgb3JkaW5hcmlseSBwb3NzaWJsZSB0byBzdGljayBkb2xsYXItc2lnbiBrZXlzIGludG8gbW9uZ29cbiAgLy8gc28gd2UgZG9uJ3QgYm90aGVyIGNoZWNraW5nIGZvciB0aGluZ3MgdGhhdCBuZWVkIGVzY2FwaW5nIGF0IHRoaXMgdGltZS5cbiAgcmV0dXJuIHVuZGVmaW5lZDtcbn07XG5cbnZhciByZXBsYWNlVHlwZXMgPSBmdW5jdGlvbiAoZG9jdW1lbnQsIGF0b21UcmFuc2Zvcm1lcikge1xuICBpZiAodHlwZW9mIGRvY3VtZW50ICE9PSAnb2JqZWN0JyB8fCBkb2N1bWVudCA9PT0gbnVsbClcbiAgICByZXR1cm4gZG9jdW1lbnQ7XG5cbiAgdmFyIHJlcGxhY2VkVG9wTGV2ZWxBdG9tID0gYXRvbVRyYW5zZm9ybWVyKGRvY3VtZW50KTtcbiAgaWYgKHJlcGxhY2VkVG9wTGV2ZWxBdG9tICE9PSB1bmRlZmluZWQpXG4gICAgcmV0dXJuIHJlcGxhY2VkVG9wTGV2ZWxBdG9tO1xuXG4gIHZhciByZXQgPSBkb2N1bWVudDtcbiAgXy5lYWNoKGRvY3VtZW50LCBmdW5jdGlvbiAodmFsLCBrZXkpIHtcbiAgICB2YXIgdmFsUmVwbGFjZWQgPSByZXBsYWNlVHlwZXModmFsLCBhdG9tVHJhbnNmb3JtZXIpO1xuICAgIGlmICh2YWwgIT09IHZhbFJlcGxhY2VkKSB7XG4gICAgICAvLyBMYXp5IGNsb25lLiBTaGFsbG93IGNvcHkuXG4gICAgICBpZiAocmV0ID09PSBkb2N1bWVudClcbiAgICAgICAgcmV0ID0gXy5jbG9uZShkb2N1bWVudCk7XG4gICAgICByZXRba2V5XSA9IHZhbFJlcGxhY2VkO1xuICAgIH1cbiAgfSk7XG4gIHJldHVybiByZXQ7XG59O1xuXG5cbk1vbmdvQ29ubmVjdGlvbiA9IGZ1bmN0aW9uICh1cmwsIG9wdGlvbnMpIHtcbiAgdmFyIHNlbGYgPSB0aGlzO1xuICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcbiAgc2VsZi5fb2JzZXJ2ZU11bHRpcGxleGVycyA9IHt9O1xuICBzZWxmLl9vbkZhaWxvdmVySG9vayA9IG5ldyBIb29rO1xuXG4gIGNvbnN0IHVzZXJPcHRpb25zID0ge1xuICAgIC4uLihNb25nby5fY29ubmVjdGlvbk9wdGlvbnMgfHwge30pLFxuICAgIC4uLihNZXRlb3Iuc2V0dGluZ3M/LnBhY2thZ2VzPy5tb25nbz8ub3B0aW9ucyB8fCB7fSlcbiAgfTtcblxuICB2YXIgbW9uZ29PcHRpb25zID0gT2JqZWN0LmFzc2lnbih7XG4gICAgaWdub3JlVW5kZWZpbmVkOiB0cnVlLFxuICB9LCB1c2VyT3B0aW9ucyk7XG5cblxuXG4gIC8vIEludGVybmFsbHkgdGhlIG9wbG9nIGNvbm5lY3Rpb25zIHNwZWNpZnkgdGhlaXIgb3duIG1heFBvb2xTaXplXG4gIC8vIHdoaWNoIHdlIGRvbid0IHdhbnQgdG8gb3ZlcndyaXRlIHdpdGggYW55IHVzZXIgZGVmaW5lZCB2YWx1ZVxuICBpZiAoXy5oYXMob3B0aW9ucywgJ21heFBvb2xTaXplJykpIHtcbiAgICAvLyBJZiB3ZSBqdXN0IHNldCB0aGlzIGZvciBcInNlcnZlclwiLCByZXBsU2V0IHdpbGwgb3ZlcnJpZGUgaXQuIElmIHdlIGp1c3RcbiAgICAvLyBzZXQgaXQgZm9yIHJlcGxTZXQsIGl0IHdpbGwgYmUgaWdub3JlZCBpZiB3ZSdyZSBub3QgdXNpbmcgYSByZXBsU2V0LlxuICAgIG1vbmdvT3B0aW9ucy5tYXhQb29sU2l6ZSA9IG9wdGlvbnMubWF4UG9vbFNpemU7XG4gIH1cblxuICAvLyBUcmFuc2Zvcm0gb3B0aW9ucyBsaWtlIFwidGxzQ0FGaWxlQXNzZXRcIjogXCJmaWxlbmFtZS5wZW1cIiBpbnRvXG4gIC8vIFwidGxzQ0FGaWxlXCI6IFwiLzxmdWxscGF0aD4vZmlsZW5hbWUucGVtXCJcbiAgT2JqZWN0LmVudHJpZXMobW9uZ29PcHRpb25zIHx8IHt9KVxuICAgIC5maWx0ZXIoKFtrZXldKSA9PiBrZXkgJiYga2V5LmVuZHNXaXRoKEZJTEVfQVNTRVRfU1VGRklYKSlcbiAgICAuZm9yRWFjaCgoW2tleSwgdmFsdWVdKSA9PiB7XG4gICAgICBjb25zdCBvcHRpb25OYW1lID0ga2V5LnJlcGxhY2UoRklMRV9BU1NFVF9TVUZGSVgsICcnKTtcbiAgICAgIG1vbmdvT3B0aW9uc1tvcHRpb25OYW1lXSA9IHBhdGguam9pbihBc3NldHMuZ2V0U2VydmVyRGlyKCksXG4gICAgICAgIEFTU0VUU19GT0xERVIsIEFQUF9GT0xERVIsIHZhbHVlKTtcbiAgICAgIGRlbGV0ZSBtb25nb09wdGlvbnNba2V5XTtcbiAgICB9KTtcblxuICBzZWxmLmRiID0gbnVsbDtcbiAgc2VsZi5fb3Bsb2dIYW5kbGUgPSBudWxsO1xuICBzZWxmLl9kb2NGZXRjaGVyID0gbnVsbDtcblxuICBzZWxmLmNsaWVudCA9IG5ldyBNb25nb0RCLk1vbmdvQ2xpZW50KHVybCwgbW9uZ29PcHRpb25zKTtcbiAgc2VsZi5kYiA9IHNlbGYuY2xpZW50LmRiKCk7XG5cbiAgc2VsZi5jbGllbnQub24oJ3NlcnZlckRlc2NyaXB0aW9uQ2hhbmdlZCcsIE1ldGVvci5iaW5kRW52aXJvbm1lbnQoZXZlbnQgPT4ge1xuICAgIC8vIFdoZW4gdGhlIGNvbm5lY3Rpb24gaXMgbm8gbG9uZ2VyIGFnYWluc3QgdGhlIHByaW1hcnkgbm9kZSwgZXhlY3V0ZSBhbGxcbiAgICAvLyBmYWlsb3ZlciBob29rcy4gVGhpcyBpcyBpbXBvcnRhbnQgZm9yIHRoZSBkcml2ZXIgYXMgaXQgaGFzIHRvIHJlLXBvb2wgdGhlXG4gICAgLy8gcXVlcnkgd2hlbiBpdCBoYXBwZW5zLlxuICAgIGlmIChcbiAgICAgIGV2ZW50LnByZXZpb3VzRGVzY3JpcHRpb24udHlwZSAhPT0gJ1JTUHJpbWFyeScgJiZcbiAgICAgIGV2ZW50Lm5ld0Rlc2NyaXB0aW9uLnR5cGUgPT09ICdSU1ByaW1hcnknXG4gICAgKSB7XG4gICAgICBzZWxmLl9vbkZhaWxvdmVySG9vay5lYWNoKGNhbGxiYWNrID0+IHtcbiAgICAgICAgY2FsbGJhY2soKTtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9KTtcbiAgICB9XG4gIH0pKTtcblxuICBpZiAob3B0aW9ucy5vcGxvZ1VybCAmJiAhIFBhY2thZ2VbJ2Rpc2FibGUtb3Bsb2cnXSkge1xuICAgIHNlbGYuX29wbG9nSGFuZGxlID0gbmV3IE9wbG9nSGFuZGxlKG9wdGlvbnMub3Bsb2dVcmwsIHNlbGYuZGIuZGF0YWJhc2VOYW1lKTtcbiAgICBzZWxmLl9kb2NGZXRjaGVyID0gbmV3IERvY0ZldGNoZXIoc2VsZik7XG4gIH1cbiAgUHJvbWlzZS5hd2FpdChzZWxmLmNsaWVudC5jb25uZWN0KCkpXG59O1xuXG5Nb25nb0Nvbm5lY3Rpb24ucHJvdG90eXBlLmNsb3NlID0gZnVuY3Rpb24oKSB7XG4gIHZhciBzZWxmID0gdGhpcztcblxuICBpZiAoISBzZWxmLmRiKVxuICAgIHRocm93IEVycm9yKFwiY2xvc2UgY2FsbGVkIGJlZm9yZSBDb25uZWN0aW9uIGNyZWF0ZWQ/XCIpO1xuXG4gIC8vIFhYWCBwcm9iYWJseSB1bnRlc3RlZFxuICB2YXIgb3Bsb2dIYW5kbGUgPSBzZWxmLl9vcGxvZ0hhbmRsZTtcbiAgc2VsZi5fb3Bsb2dIYW5kbGUgPSBudWxsO1xuICBpZiAob3Bsb2dIYW5kbGUpXG4gICAgb3Bsb2dIYW5kbGUuc3RvcCgpO1xuXG4gIC8vIFVzZSBGdXR1cmUud3JhcCBzbyB0aGF0IGVycm9ycyBnZXQgdGhyb3duLiBUaGlzIGhhcHBlbnMgdG9cbiAgLy8gd29yayBldmVuIG91dHNpZGUgYSBmaWJlciBzaW5jZSB0aGUgJ2Nsb3NlJyBtZXRob2QgaXMgbm90XG4gIC8vIGFjdHVhbGx5IGFzeW5jaHJvbm91cy5cbiAgRnV0dXJlLndyYXAoXy5iaW5kKHNlbGYuY2xpZW50LmNsb3NlLCBzZWxmLmNsaWVudCkpKHRydWUpLndhaXQoKTtcbn07XG5cbi8vIFJldHVybnMgdGhlIE1vbmdvIENvbGxlY3Rpb24gb2JqZWN0OyBtYXkgeWllbGQuXG5Nb25nb0Nvbm5lY3Rpb24ucHJvdG90eXBlLnJhd0NvbGxlY3Rpb24gPSBmdW5jdGlvbiAoY29sbGVjdGlvbk5hbWUpIHtcbiAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gIGlmICghIHNlbGYuZGIpXG4gICAgdGhyb3cgRXJyb3IoXCJyYXdDb2xsZWN0aW9uIGNhbGxlZCBiZWZvcmUgQ29ubmVjdGlvbiBjcmVhdGVkP1wiKTtcblxuICByZXR1cm4gc2VsZi5kYi5jb2xsZWN0aW9uKGNvbGxlY3Rpb25OYW1lKTtcbn07XG5cbk1vbmdvQ29ubmVjdGlvbi5wcm90b3R5cGUuX2NyZWF0ZUNhcHBlZENvbGxlY3Rpb24gPSBmdW5jdGlvbiAoXG4gICAgY29sbGVjdGlvbk5hbWUsIGJ5dGVTaXplLCBtYXhEb2N1bWVudHMpIHtcbiAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gIGlmICghIHNlbGYuZGIpXG4gICAgdGhyb3cgRXJyb3IoXCJfY3JlYXRlQ2FwcGVkQ29sbGVjdGlvbiBjYWxsZWQgYmVmb3JlIENvbm5lY3Rpb24gY3JlYXRlZD9cIik7XG5cblxuICB2YXIgZnV0dXJlID0gbmV3IEZ1dHVyZSgpO1xuICBzZWxmLmRiLmNyZWF0ZUNvbGxlY3Rpb24oXG4gICAgY29sbGVjdGlvbk5hbWUsXG4gICAgeyBjYXBwZWQ6IHRydWUsIHNpemU6IGJ5dGVTaXplLCBtYXg6IG1heERvY3VtZW50cyB9LFxuICAgIGZ1dHVyZS5yZXNvbHZlcigpKTtcbiAgZnV0dXJlLndhaXQoKTtcbn07XG5cbi8vIFRoaXMgc2hvdWxkIGJlIGNhbGxlZCBzeW5jaHJvbm91c2x5IHdpdGggYSB3cml0ZSwgdG8gY3JlYXRlIGFcbi8vIHRyYW5zYWN0aW9uIG9uIHRoZSBjdXJyZW50IHdyaXRlIGZlbmNlLCBpZiBhbnkuIEFmdGVyIHdlIGNhbiByZWFkXG4vLyB0aGUgd3JpdGUsIGFuZCBhZnRlciBvYnNlcnZlcnMgaGF2ZSBiZWVuIG5vdGlmaWVkIChvciBhdCBsZWFzdCxcbi8vIGFmdGVyIHRoZSBvYnNlcnZlciBub3RpZmllcnMgaGF2ZSBhZGRlZCB0aGVtc2VsdmVzIHRvIHRoZSB3cml0ZVxuLy8gZmVuY2UpLCB5b3Ugc2hvdWxkIGNhbGwgJ2NvbW1pdHRlZCgpJyBvbiB0aGUgb2JqZWN0IHJldHVybmVkLlxuTW9uZ29Db25uZWN0aW9uLnByb3RvdHlwZS5fbWF5YmVCZWdpbldyaXRlID0gZnVuY3Rpb24gKCkge1xuICB2YXIgZmVuY2UgPSBERFBTZXJ2ZXIuX0N1cnJlbnRXcml0ZUZlbmNlLmdldCgpO1xuICBpZiAoZmVuY2UpIHtcbiAgICByZXR1cm4gZmVuY2UuYmVnaW5Xcml0ZSgpO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiB7Y29tbWl0dGVkOiBmdW5jdGlvbiAoKSB7fX07XG4gIH1cbn07XG5cbi8vIEludGVybmFsIGludGVyZmFjZTogYWRkcyBhIGNhbGxiYWNrIHdoaWNoIGlzIGNhbGxlZCB3aGVuIHRoZSBNb25nbyBwcmltYXJ5XG4vLyBjaGFuZ2VzLiBSZXR1cm5zIGEgc3RvcCBoYW5kbGUuXG5Nb25nb0Nvbm5lY3Rpb24ucHJvdG90eXBlLl9vbkZhaWxvdmVyID0gZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gIHJldHVybiB0aGlzLl9vbkZhaWxvdmVySG9vay5yZWdpc3RlcihjYWxsYmFjayk7XG59O1xuXG5cbi8vLy8vLy8vLy8vLyBQdWJsaWMgQVBJIC8vLy8vLy8vLy9cblxuLy8gVGhlIHdyaXRlIG1ldGhvZHMgYmxvY2sgdW50aWwgdGhlIGRhdGFiYXNlIGhhcyBjb25maXJtZWQgdGhlIHdyaXRlIChpdCBtYXlcbi8vIG5vdCBiZSByZXBsaWNhdGVkIG9yIHN0YWJsZSBvbiBkaXNrLCBidXQgb25lIHNlcnZlciBoYXMgY29uZmlybWVkIGl0KSBpZiBub1xuLy8gY2FsbGJhY2sgaXMgcHJvdmlkZWQuIElmIGEgY2FsbGJhY2sgaXMgcHJvdmlkZWQsIHRoZW4gdGhleSBjYWxsIHRoZSBjYWxsYmFja1xuLy8gd2hlbiB0aGUgd3JpdGUgaXMgY29uZmlybWVkLiBUaGV5IHJldHVybiBub3RoaW5nIG9uIHN1Y2Nlc3MsIGFuZCByYWlzZSBhblxuLy8gZXhjZXB0aW9uIG9uIGZhaWx1cmUuXG4vL1xuLy8gQWZ0ZXIgbWFraW5nIGEgd3JpdGUgKHdpdGggaW5zZXJ0LCB1cGRhdGUsIHJlbW92ZSksIG9ic2VydmVycyBhcmVcbi8vIG5vdGlmaWVkIGFzeW5jaHJvbm91c2x5LiBJZiB5b3Ugd2FudCB0byByZWNlaXZlIGEgY2FsbGJhY2sgb25jZSBhbGxcbi8vIG9mIHRoZSBvYnNlcnZlciBub3RpZmljYXRpb25zIGhhdmUgbGFuZGVkIGZvciB5b3VyIHdyaXRlLCBkbyB0aGVcbi8vIHdyaXRlcyBpbnNpZGUgYSB3cml0ZSBmZW5jZSAoc2V0IEREUFNlcnZlci5fQ3VycmVudFdyaXRlRmVuY2UgdG8gYSBuZXdcbi8vIF9Xcml0ZUZlbmNlLCBhbmQgdGhlbiBzZXQgYSBjYWxsYmFjayBvbiB0aGUgd3JpdGUgZmVuY2UuKVxuLy9cbi8vIFNpbmNlIG91ciBleGVjdXRpb24gZW52aXJvbm1lbnQgaXMgc2luZ2xlLXRocmVhZGVkLCB0aGlzIGlzXG4vLyB3ZWxsLWRlZmluZWQgLS0gYSB3cml0ZSBcImhhcyBiZWVuIG1hZGVcIiBpZiBpdCdzIHJldHVybmVkLCBhbmQgYW5cbi8vIG9ic2VydmVyIFwiaGFzIGJlZW4gbm90aWZpZWRcIiBpZiBpdHMgY2FsbGJhY2sgaGFzIHJldHVybmVkLlxuXG52YXIgd3JpdGVDYWxsYmFjayA9IGZ1bmN0aW9uICh3cml0ZSwgcmVmcmVzaCwgY2FsbGJhY2spIHtcbiAgcmV0dXJuIGZ1bmN0aW9uIChlcnIsIHJlc3VsdCkge1xuICAgIGlmICghIGVycikge1xuICAgICAgLy8gWFhYIFdlIGRvbid0IGhhdmUgdG8gcnVuIHRoaXMgb24gZXJyb3IsIHJpZ2h0P1xuICAgICAgdHJ5IHtcbiAgICAgICAgcmVmcmVzaCgpO1xuICAgICAgfSBjYXRjaCAocmVmcmVzaEVycikge1xuICAgICAgICBpZiAoY2FsbGJhY2spIHtcbiAgICAgICAgICBjYWxsYmFjayhyZWZyZXNoRXJyKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhyb3cgcmVmcmVzaEVycjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICB3cml0ZS5jb21taXR0ZWQoKTtcbiAgICBpZiAoY2FsbGJhY2spIHtcbiAgICAgIGNhbGxiYWNrKGVyciwgcmVzdWx0KTtcbiAgICB9IGVsc2UgaWYgKGVycikge1xuICAgICAgdGhyb3cgZXJyO1xuICAgIH1cbiAgfTtcbn07XG5cbnZhciBiaW5kRW52aXJvbm1lbnRGb3JXcml0ZSA9IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICByZXR1cm4gTWV0ZW9yLmJpbmRFbnZpcm9ubWVudChjYWxsYmFjaywgXCJNb25nbyB3cml0ZVwiKTtcbn07XG5cbk1vbmdvQ29ubmVjdGlvbi5wcm90b3R5cGUuX2luc2VydCA9IGZ1bmN0aW9uIChjb2xsZWN0aW9uX25hbWUsIGRvY3VtZW50LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrKSB7XG4gIHZhciBzZWxmID0gdGhpcztcblxuICB2YXIgc2VuZEVycm9yID0gZnVuY3Rpb24gKGUpIHtcbiAgICBpZiAoY2FsbGJhY2spXG4gICAgICByZXR1cm4gY2FsbGJhY2soZSk7XG4gICAgdGhyb3cgZTtcbiAgfTtcblxuICBpZiAoY29sbGVjdGlvbl9uYW1lID09PSBcIl9fX21ldGVvcl9mYWlsdXJlX3Rlc3RfY29sbGVjdGlvblwiKSB7XG4gICAgdmFyIGUgPSBuZXcgRXJyb3IoXCJGYWlsdXJlIHRlc3RcIik7XG4gICAgZS5fZXhwZWN0ZWRCeVRlc3QgPSB0cnVlO1xuICAgIHNlbmRFcnJvcihlKTtcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAoIShMb2NhbENvbGxlY3Rpb24uX2lzUGxhaW5PYmplY3QoZG9jdW1lbnQpICYmXG4gICAgICAgICFFSlNPTi5faXNDdXN0b21UeXBlKGRvY3VtZW50KSkpIHtcbiAgICBzZW5kRXJyb3IobmV3IEVycm9yKFxuICAgICAgXCJPbmx5IHBsYWluIG9iamVjdHMgbWF5IGJlIGluc2VydGVkIGludG8gTW9uZ29EQlwiKSk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgdmFyIHdyaXRlID0gc2VsZi5fbWF5YmVCZWdpbldyaXRlKCk7XG4gIHZhciByZWZyZXNoID0gZnVuY3Rpb24gKCkge1xuICAgIE1ldGVvci5yZWZyZXNoKHtjb2xsZWN0aW9uOiBjb2xsZWN0aW9uX25hbWUsIGlkOiBkb2N1bWVudC5faWQgfSk7XG4gIH07XG4gIGNhbGxiYWNrID0gYmluZEVudmlyb25tZW50Rm9yV3JpdGUod3JpdGVDYWxsYmFjayh3cml0ZSwgcmVmcmVzaCwgY2FsbGJhY2spKTtcbiAgdHJ5IHtcbiAgICB2YXIgY29sbGVjdGlvbiA9IHNlbGYucmF3Q29sbGVjdGlvbihjb2xsZWN0aW9uX25hbWUpO1xuICAgIGNvbGxlY3Rpb24uaW5zZXJ0T25lKFxuICAgICAgcmVwbGFjZVR5cGVzKGRvY3VtZW50LCByZXBsYWNlTWV0ZW9yQXRvbVdpdGhNb25nbyksXG4gICAgICB7XG4gICAgICAgIHNhZmU6IHRydWUsXG4gICAgICB9XG4gICAgKS50aGVuKCh7aW5zZXJ0ZWRJZH0pID0+IHtcbiAgICAgIGNhbGxiYWNrKG51bGwsIGluc2VydGVkSWQpO1xuICAgIH0pLmNhdGNoKChlKSA9PiB7XG4gICAgICBjYWxsYmFjayhlLCBudWxsKVxuICAgIH0pO1xuICB9IGNhdGNoIChlcnIpIHtcbiAgICB3cml0ZS5jb21taXR0ZWQoKTtcbiAgICB0aHJvdyBlcnI7XG4gIH1cbn07XG5cbi8vIENhdXNlIHF1ZXJpZXMgdGhhdCBtYXkgYmUgYWZmZWN0ZWQgYnkgdGhlIHNlbGVjdG9yIHRvIHBvbGwgaW4gdGhpcyB3cml0ZVxuLy8gZmVuY2UuXG5Nb25nb0Nvbm5lY3Rpb24ucHJvdG90eXBlLl9yZWZyZXNoID0gZnVuY3Rpb24gKGNvbGxlY3Rpb25OYW1lLCBzZWxlY3Rvcikge1xuICB2YXIgcmVmcmVzaEtleSA9IHtjb2xsZWN0aW9uOiBjb2xsZWN0aW9uTmFtZX07XG4gIC8vIElmIHdlIGtub3cgd2hpY2ggZG9jdW1lbnRzIHdlJ3JlIHJlbW92aW5nLCBkb24ndCBwb2xsIHF1ZXJpZXMgdGhhdCBhcmVcbiAgLy8gc3BlY2lmaWMgdG8gb3RoZXIgZG9jdW1lbnRzLiAoTm90ZSB0aGF0IG11bHRpcGxlIG5vdGlmaWNhdGlvbnMgaGVyZSBzaG91bGRcbiAgLy8gbm90IGNhdXNlIG11bHRpcGxlIHBvbGxzLCBzaW5jZSBhbGwgb3VyIGxpc3RlbmVyIGlzIGRvaW5nIGlzIGVucXVldWVpbmcgYVxuICAvLyBwb2xsLilcbiAgdmFyIHNwZWNpZmljSWRzID0gTG9jYWxDb2xsZWN0aW9uLl9pZHNNYXRjaGVkQnlTZWxlY3RvcihzZWxlY3Rvcik7XG4gIGlmIChzcGVjaWZpY0lkcykge1xuICAgIF8uZWFjaChzcGVjaWZpY0lkcywgZnVuY3Rpb24gKGlkKSB7XG4gICAgICBNZXRlb3IucmVmcmVzaChfLmV4dGVuZCh7aWQ6IGlkfSwgcmVmcmVzaEtleSkpO1xuICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIE1ldGVvci5yZWZyZXNoKHJlZnJlc2hLZXkpO1xuICB9XG59O1xuXG5Nb25nb0Nvbm5lY3Rpb24ucHJvdG90eXBlLl9yZW1vdmUgPSBmdW5jdGlvbiAoY29sbGVjdGlvbl9uYW1lLCBzZWxlY3RvcixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjYWxsYmFjaykge1xuICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgaWYgKGNvbGxlY3Rpb25fbmFtZSA9PT0gXCJfX19tZXRlb3JfZmFpbHVyZV90ZXN0X2NvbGxlY3Rpb25cIikge1xuICAgIHZhciBlID0gbmV3IEVycm9yKFwiRmFpbHVyZSB0ZXN0XCIpO1xuICAgIGUuX2V4cGVjdGVkQnlUZXN0ID0gdHJ1ZTtcbiAgICBpZiAoY2FsbGJhY2spIHtcbiAgICAgIHJldHVybiBjYWxsYmFjayhlKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgZTtcbiAgICB9XG4gIH1cblxuICB2YXIgd3JpdGUgPSBzZWxmLl9tYXliZUJlZ2luV3JpdGUoKTtcbiAgdmFyIHJlZnJlc2ggPSBmdW5jdGlvbiAoKSB7XG4gICAgc2VsZi5fcmVmcmVzaChjb2xsZWN0aW9uX25hbWUsIHNlbGVjdG9yKTtcbiAgfTtcbiAgY2FsbGJhY2sgPSBiaW5kRW52aXJvbm1lbnRGb3JXcml0ZSh3cml0ZUNhbGxiYWNrKHdyaXRlLCByZWZyZXNoLCBjYWxsYmFjaykpO1xuXG4gIHRyeSB7XG4gICAgdmFyIGNvbGxlY3Rpb24gPSBzZWxmLnJhd0NvbGxlY3Rpb24oY29sbGVjdGlvbl9uYW1lKTtcbiAgICBjb2xsZWN0aW9uXG4gICAgICAuZGVsZXRlTWFueShyZXBsYWNlVHlwZXMoc2VsZWN0b3IsIHJlcGxhY2VNZXRlb3JBdG9tV2l0aE1vbmdvKSwge1xuICAgICAgICBzYWZlOiB0cnVlLFxuICAgICAgfSlcbiAgICAgIC50aGVuKCh7IGRlbGV0ZWRDb3VudCB9KSA9PiB7XG4gICAgICAgIGNhbGxiYWNrKG51bGwsIHRyYW5zZm9ybVJlc3VsdCh7IHJlc3VsdCA6IHttb2RpZmllZENvdW50IDogZGVsZXRlZENvdW50fSB9KS5udW1iZXJBZmZlY3RlZCk7XG4gICAgICB9KS5jYXRjaCgoZXJyKSA9PiB7XG4gICAgICBjYWxsYmFjayhlcnIpO1xuICAgIH0pO1xuICB9IGNhdGNoIChlcnIpIHtcbiAgICB3cml0ZS5jb21taXR0ZWQoKTtcbiAgICB0aHJvdyBlcnI7XG4gIH1cbn07XG5cbk1vbmdvQ29ubmVjdGlvbi5wcm90b3R5cGUuX2Ryb3BDb2xsZWN0aW9uID0gZnVuY3Rpb24gKGNvbGxlY3Rpb25OYW1lLCBjYikge1xuICB2YXIgc2VsZiA9IHRoaXM7XG5cblxuICB2YXIgd3JpdGUgPSBzZWxmLl9tYXliZUJlZ2luV3JpdGUoKTtcbiAgdmFyIHJlZnJlc2ggPSBmdW5jdGlvbiAoKSB7XG4gICAgTWV0ZW9yLnJlZnJlc2goe2NvbGxlY3Rpb246IGNvbGxlY3Rpb25OYW1lLCBpZDogbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgZHJvcENvbGxlY3Rpb246IHRydWV9KTtcbiAgfTtcblxuXG4gIGNiID0gYmluZEVudmlyb25tZW50Rm9yV3JpdGUod3JpdGVDYWxsYmFjayh3cml0ZSwgcmVmcmVzaCwgY2IpKTtcblxuICB0cnkge1xuICAgIHZhciBjb2xsZWN0aW9uID0gc2VsZi5yYXdDb2xsZWN0aW9uKGNvbGxlY3Rpb25OYW1lKTtcbiAgICBjb2xsZWN0aW9uLmRyb3AoY2IpO1xuICB9IGNhdGNoIChlKSB7XG4gICAgd3JpdGUuY29tbWl0dGVkKCk7XG4gICAgdGhyb3cgZTtcbiAgfVxufTtcblxuLy8gRm9yIHRlc3Rpbmcgb25seS4gIFNsaWdodGx5IGJldHRlciB0aGFuIGBjLnJhd0RhdGFiYXNlKCkuZHJvcERhdGFiYXNlKClgXG4vLyBiZWNhdXNlIGl0IGxldHMgdGhlIHRlc3QncyBmZW5jZSB3YWl0IGZvciBpdCB0byBiZSBjb21wbGV0ZS5cbk1vbmdvQ29ubmVjdGlvbi5wcm90b3R5cGUuX2Ryb3BEYXRhYmFzZSA9IGZ1bmN0aW9uIChjYikge1xuICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgdmFyIHdyaXRlID0gc2VsZi5fbWF5YmVCZWdpbldyaXRlKCk7XG4gIHZhciByZWZyZXNoID0gZnVuY3Rpb24gKCkge1xuICAgIE1ldGVvci5yZWZyZXNoKHsgZHJvcERhdGFiYXNlOiB0cnVlIH0pO1xuICB9O1xuICBjYiA9IGJpbmRFbnZpcm9ubWVudEZvcldyaXRlKHdyaXRlQ2FsbGJhY2sod3JpdGUsIHJlZnJlc2gsIGNiKSk7XG5cbiAgdHJ5IHtcbiAgICBzZWxmLmRiLmRyb3BEYXRhYmFzZShjYik7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICB3cml0ZS5jb21taXR0ZWQoKTtcbiAgICB0aHJvdyBlO1xuICB9XG59O1xuXG5Nb25nb0Nvbm5lY3Rpb24ucHJvdG90eXBlLl91cGRhdGUgPSBmdW5jdGlvbiAoY29sbGVjdGlvbl9uYW1lLCBzZWxlY3RvciwgbW9kLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG9wdGlvbnMsIGNhbGxiYWNrKSB7XG4gIHZhciBzZWxmID0gdGhpcztcblxuXG5cbiAgaWYgKCEgY2FsbGJhY2sgJiYgb3B0aW9ucyBpbnN0YW5jZW9mIEZ1bmN0aW9uKSB7XG4gICAgY2FsbGJhY2sgPSBvcHRpb25zO1xuICAgIG9wdGlvbnMgPSBudWxsO1xuICB9XG5cbiAgaWYgKGNvbGxlY3Rpb25fbmFtZSA9PT0gXCJfX19tZXRlb3JfZmFpbHVyZV90ZXN0X2NvbGxlY3Rpb25cIikge1xuICAgIHZhciBlID0gbmV3IEVycm9yKFwiRmFpbHVyZSB0ZXN0XCIpO1xuICAgIGUuX2V4cGVjdGVkQnlUZXN0ID0gdHJ1ZTtcbiAgICBpZiAoY2FsbGJhY2spIHtcbiAgICAgIHJldHVybiBjYWxsYmFjayhlKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgZTtcbiAgICB9XG4gIH1cblxuICAvLyBleHBsaWNpdCBzYWZldHkgY2hlY2suIG51bGwgYW5kIHVuZGVmaW5lZCBjYW4gY3Jhc2ggdGhlIG1vbmdvXG4gIC8vIGRyaXZlci4gQWx0aG91Z2ggdGhlIG5vZGUgZHJpdmVyIGFuZCBtaW5pbW9uZ28gZG8gJ3N1cHBvcnQnXG4gIC8vIG5vbi1vYmplY3QgbW9kaWZpZXIgaW4gdGhhdCB0aGV5IGRvbid0IGNyYXNoLCB0aGV5IGFyZSBub3RcbiAgLy8gbWVhbmluZ2Z1bCBvcGVyYXRpb25zIGFuZCBkbyBub3QgZG8gYW55dGhpbmcuIERlZmVuc2l2ZWx5IHRocm93IGFuXG4gIC8vIGVycm9yIGhlcmUuXG4gIGlmICghbW9kIHx8IHR5cGVvZiBtb2QgIT09ICdvYmplY3QnKVxuICAgIHRocm93IG5ldyBFcnJvcihcIkludmFsaWQgbW9kaWZpZXIuIE1vZGlmaWVyIG11c3QgYmUgYW4gb2JqZWN0LlwiKTtcblxuICBpZiAoIShMb2NhbENvbGxlY3Rpb24uX2lzUGxhaW5PYmplY3QobW9kKSAmJlxuICAgICAgICAhRUpTT04uX2lzQ3VzdG9tVHlwZShtb2QpKSkge1xuICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgIFwiT25seSBwbGFpbiBvYmplY3RzIG1heSBiZSB1c2VkIGFzIHJlcGxhY2VtZW50XCIgK1xuICAgICAgICBcIiBkb2N1bWVudHMgaW4gTW9uZ29EQlwiKTtcbiAgfVxuXG4gIGlmICghb3B0aW9ucykgb3B0aW9ucyA9IHt9O1xuXG4gIHZhciB3cml0ZSA9IHNlbGYuX21heWJlQmVnaW5Xcml0ZSgpO1xuICB2YXIgcmVmcmVzaCA9IGZ1bmN0aW9uICgpIHtcbiAgICBzZWxmLl9yZWZyZXNoKGNvbGxlY3Rpb25fbmFtZSwgc2VsZWN0b3IpO1xuICB9O1xuICBjYWxsYmFjayA9IHdyaXRlQ2FsbGJhY2sod3JpdGUsIHJlZnJlc2gsIGNhbGxiYWNrKTtcbiAgdHJ5IHtcbiAgICB2YXIgY29sbGVjdGlvbiA9IHNlbGYucmF3Q29sbGVjdGlvbihjb2xsZWN0aW9uX25hbWUpO1xuICAgIHZhciBtb25nb09wdHMgPSB7c2FmZTogdHJ1ZX07XG4gICAgLy8gQWRkIHN1cHBvcnQgZm9yIGZpbHRlcmVkIHBvc2l0aW9uYWwgb3BlcmF0b3JcbiAgICBpZiAob3B0aW9ucy5hcnJheUZpbHRlcnMgIT09IHVuZGVmaW5lZCkgbW9uZ29PcHRzLmFycmF5RmlsdGVycyA9IG9wdGlvbnMuYXJyYXlGaWx0ZXJzO1xuICAgIC8vIGV4cGxpY3RseSBlbnVtZXJhdGUgb3B0aW9ucyB0aGF0IG1pbmltb25nbyBzdXBwb3J0c1xuICAgIGlmIChvcHRpb25zLnVwc2VydCkgbW9uZ29PcHRzLnVwc2VydCA9IHRydWU7XG4gICAgaWYgKG9wdGlvbnMubXVsdGkpIG1vbmdvT3B0cy5tdWx0aSA9IHRydWU7XG4gICAgLy8gTGV0cyB5b3UgZ2V0IGEgbW9yZSBtb3JlIGZ1bGwgcmVzdWx0IGZyb20gTW9uZ29EQi4gVXNlIHdpdGggY2F1dGlvbjpcbiAgICAvLyBtaWdodCBub3Qgd29yayB3aXRoIEMudXBzZXJ0IChhcyBvcHBvc2VkIHRvIEMudXBkYXRlKHt1cHNlcnQ6dHJ1ZX0pIG9yXG4gICAgLy8gd2l0aCBzaW11bGF0ZWQgdXBzZXJ0LlxuICAgIGlmIChvcHRpb25zLmZ1bGxSZXN1bHQpIG1vbmdvT3B0cy5mdWxsUmVzdWx0ID0gdHJ1ZTtcblxuICAgIHZhciBtb25nb1NlbGVjdG9yID0gcmVwbGFjZVR5cGVzKHNlbGVjdG9yLCByZXBsYWNlTWV0ZW9yQXRvbVdpdGhNb25nbyk7XG4gICAgdmFyIG1vbmdvTW9kID0gcmVwbGFjZVR5cGVzKG1vZCwgcmVwbGFjZU1ldGVvckF0b21XaXRoTW9uZ28pO1xuXG4gICAgdmFyIGlzTW9kaWZ5ID0gTG9jYWxDb2xsZWN0aW9uLl9pc01vZGlmaWNhdGlvbk1vZChtb25nb01vZCk7XG5cbiAgICBpZiAob3B0aW9ucy5fZm9yYmlkUmVwbGFjZSAmJiAhaXNNb2RpZnkpIHtcbiAgICAgIHZhciBlcnIgPSBuZXcgRXJyb3IoXCJJbnZhbGlkIG1vZGlmaWVyLiBSZXBsYWNlbWVudHMgYXJlIGZvcmJpZGRlbi5cIik7XG4gICAgICBpZiAoY2FsbGJhY2spIHtcbiAgICAgICAgcmV0dXJuIGNhbGxiYWNrKGVycik7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBlcnI7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gV2UndmUgYWxyZWFkeSBydW4gcmVwbGFjZVR5cGVzL3JlcGxhY2VNZXRlb3JBdG9tV2l0aE1vbmdvIG9uXG4gICAgLy8gc2VsZWN0b3IgYW5kIG1vZC4gIFdlIGFzc3VtZSBpdCBkb2Vzbid0IG1hdHRlciwgYXMgZmFyIGFzXG4gICAgLy8gdGhlIGJlaGF2aW9yIG9mIG1vZGlmaWVycyBpcyBjb25jZXJuZWQsIHdoZXRoZXIgYF9tb2RpZnlgXG4gICAgLy8gaXMgcnVuIG9uIEVKU09OIG9yIG9uIG1vbmdvLWNvbnZlcnRlZCBFSlNPTi5cblxuICAgIC8vIFJ1biB0aGlzIGNvZGUgdXAgZnJvbnQgc28gdGhhdCBpdCBmYWlscyBmYXN0IGlmIHNvbWVvbmUgdXNlc1xuICAgIC8vIGEgTW9uZ28gdXBkYXRlIG9wZXJhdG9yIHdlIGRvbid0IHN1cHBvcnQuXG4gICAgbGV0IGtub3duSWQ7XG4gICAgaWYgKG9wdGlvbnMudXBzZXJ0KSB7XG4gICAgICB0cnkge1xuICAgICAgICBsZXQgbmV3RG9jID0gTG9jYWxDb2xsZWN0aW9uLl9jcmVhdGVVcHNlcnREb2N1bWVudChzZWxlY3RvciwgbW9kKTtcbiAgICAgICAga25vd25JZCA9IG5ld0RvYy5faWQ7XG4gICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgaWYgKGNhbGxiYWNrKSB7XG4gICAgICAgICAgcmV0dXJuIGNhbGxiYWNrKGVycik7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKG9wdGlvbnMudXBzZXJ0ICYmXG4gICAgICAgICEgaXNNb2RpZnkgJiZcbiAgICAgICAgISBrbm93bklkICYmXG4gICAgICAgIG9wdGlvbnMuaW5zZXJ0ZWRJZCAmJlxuICAgICAgICAhIChvcHRpb25zLmluc2VydGVkSWQgaW5zdGFuY2VvZiBNb25nby5PYmplY3RJRCAmJlxuICAgICAgICAgICBvcHRpb25zLmdlbmVyYXRlZElkKSkge1xuICAgICAgLy8gSW4gY2FzZSBvZiBhbiB1cHNlcnQgd2l0aCBhIHJlcGxhY2VtZW50LCB3aGVyZSB0aGVyZSBpcyBubyBfaWQgZGVmaW5lZFxuICAgICAgLy8gaW4gZWl0aGVyIHRoZSBxdWVyeSBvciB0aGUgcmVwbGFjZW1lbnQgZG9jLCBtb25nbyB3aWxsIGdlbmVyYXRlIGFuIGlkIGl0c2VsZi5cbiAgICAgIC8vIFRoZXJlZm9yZSB3ZSBuZWVkIHRoaXMgc3BlY2lhbCBzdHJhdGVneSBpZiB3ZSB3YW50IHRvIGNvbnRyb2wgdGhlIGlkIG91cnNlbHZlcy5cblxuICAgICAgLy8gV2UgZG9uJ3QgbmVlZCB0byBkbyB0aGlzIHdoZW46XG4gICAgICAvLyAtIFRoaXMgaXMgbm90IGEgcmVwbGFjZW1lbnQsIHNvIHdlIGNhbiBhZGQgYW4gX2lkIHRvICRzZXRPbkluc2VydFxuICAgICAgLy8gLSBUaGUgaWQgaXMgZGVmaW5lZCBieSBxdWVyeSBvciBtb2Qgd2UgY2FuIGp1c3QgYWRkIGl0IHRvIHRoZSByZXBsYWNlbWVudCBkb2NcbiAgICAgIC8vIC0gVGhlIHVzZXIgZGlkIG5vdCBzcGVjaWZ5IGFueSBpZCBwcmVmZXJlbmNlIGFuZCB0aGUgaWQgaXMgYSBNb25nbyBPYmplY3RJZCxcbiAgICAgIC8vICAgICB0aGVuIHdlIGNhbiBqdXN0IGxldCBNb25nbyBnZW5lcmF0ZSB0aGUgaWRcblxuICAgICAgc2ltdWxhdGVVcHNlcnRXaXRoSW5zZXJ0ZWRJZChcbiAgICAgICAgY29sbGVjdGlvbiwgbW9uZ29TZWxlY3RvciwgbW9uZ29Nb2QsIG9wdGlvbnMsXG4gICAgICAgIC8vIFRoaXMgY2FsbGJhY2sgZG9lcyBub3QgbmVlZCB0byBiZSBiaW5kRW52aXJvbm1lbnQnZWQgYmVjYXVzZVxuICAgICAgICAvLyBzaW11bGF0ZVVwc2VydFdpdGhJbnNlcnRlZElkKCkgd3JhcHMgaXQgYW5kIHRoZW4gcGFzc2VzIGl0IHRocm91Z2hcbiAgICAgICAgLy8gYmluZEVudmlyb25tZW50Rm9yV3JpdGUuXG4gICAgICAgIGZ1bmN0aW9uIChlcnJvciwgcmVzdWx0KSB7XG4gICAgICAgICAgLy8gSWYgd2UgZ290IGhlcmUgdmlhIGEgdXBzZXJ0KCkgY2FsbCwgdGhlbiBvcHRpb25zLl9yZXR1cm5PYmplY3Qgd2lsbFxuICAgICAgICAgIC8vIGJlIHNldCBhbmQgd2Ugc2hvdWxkIHJldHVybiB0aGUgd2hvbGUgb2JqZWN0LiBPdGhlcndpc2UsIHdlIHNob3VsZFxuICAgICAgICAgIC8vIGp1c3QgcmV0dXJuIHRoZSBudW1iZXIgb2YgYWZmZWN0ZWQgZG9jcyB0byBtYXRjaCB0aGUgbW9uZ28gQVBJLlxuICAgICAgICAgIGlmIChyZXN1bHQgJiYgISBvcHRpb25zLl9yZXR1cm5PYmplY3QpIHtcbiAgICAgICAgICAgIGNhbGxiYWNrKGVycm9yLCByZXN1bHQubnVtYmVyQWZmZWN0ZWQpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjYWxsYmFjayhlcnJvciwgcmVzdWx0KTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICk7XG4gICAgfSBlbHNlIHtcblxuICAgICAgaWYgKG9wdGlvbnMudXBzZXJ0ICYmICFrbm93bklkICYmIG9wdGlvbnMuaW5zZXJ0ZWRJZCAmJiBpc01vZGlmeSkge1xuICAgICAgICBpZiAoIW1vbmdvTW9kLmhhc093blByb3BlcnR5KCckc2V0T25JbnNlcnQnKSkge1xuICAgICAgICAgIG1vbmdvTW9kLiRzZXRPbkluc2VydCA9IHt9O1xuICAgICAgICB9XG4gICAgICAgIGtub3duSWQgPSBvcHRpb25zLmluc2VydGVkSWQ7XG4gICAgICAgIE9iamVjdC5hc3NpZ24obW9uZ29Nb2QuJHNldE9uSW5zZXJ0LCByZXBsYWNlVHlwZXMoe19pZDogb3B0aW9ucy5pbnNlcnRlZElkfSwgcmVwbGFjZU1ldGVvckF0b21XaXRoTW9uZ28pKTtcbiAgICAgIH1cblxuICAgICAgY29uc3Qgc3RyaW5ncyA9IE9iamVjdC5rZXlzKG1vbmdvTW9kKS5maWx0ZXIoKGtleSkgPT4gIWtleS5zdGFydHNXaXRoKFwiJFwiKSk7XG4gICAgICBsZXQgdXBkYXRlTWV0aG9kID0gc3RyaW5ncy5sZW5ndGggPiAwID8gJ3JlcGxhY2VPbmUnIDogJ3VwZGF0ZU1hbnknO1xuICAgICAgdXBkYXRlTWV0aG9kID1cbiAgICAgICAgdXBkYXRlTWV0aG9kID09PSAndXBkYXRlTWFueScgJiYgIW1vbmdvT3B0cy5tdWx0aVxuICAgICAgICAgID8gJ3VwZGF0ZU9uZSdcbiAgICAgICAgICA6IHVwZGF0ZU1ldGhvZDtcbiAgICAgIGNvbGxlY3Rpb25bdXBkYXRlTWV0aG9kXS5iaW5kKGNvbGxlY3Rpb24pKFxuICAgICAgICBtb25nb1NlbGVjdG9yLCBtb25nb01vZCwgbW9uZ29PcHRzLFxuICAgICAgICAgIC8vIG1vbmdvIGRyaXZlciBub3cgcmV0dXJucyB1bmRlZmluZWQgZm9yIGVyciBpbiB0aGUgY2FsbGJhY2tcbiAgICAgICAgICBiaW5kRW52aXJvbm1lbnRGb3JXcml0ZShmdW5jdGlvbiAoZXJyID0gbnVsbCwgcmVzdWx0KSB7XG4gICAgICAgICAgaWYgKCEgZXJyKSB7XG4gICAgICAgICAgICB2YXIgbWV0ZW9yUmVzdWx0ID0gdHJhbnNmb3JtUmVzdWx0KHtyZXN1bHR9KTtcbiAgICAgICAgICAgIGlmIChtZXRlb3JSZXN1bHQgJiYgb3B0aW9ucy5fcmV0dXJuT2JqZWN0KSB7XG4gICAgICAgICAgICAgIC8vIElmIHRoaXMgd2FzIGFuIHVwc2VydCgpIGNhbGwsIGFuZCB3ZSBlbmRlZCB1cFxuICAgICAgICAgICAgICAvLyBpbnNlcnRpbmcgYSBuZXcgZG9jIGFuZCB3ZSBrbm93IGl0cyBpZCwgdGhlblxuICAgICAgICAgICAgICAvLyByZXR1cm4gdGhhdCBpZCBhcyB3ZWxsLlxuICAgICAgICAgICAgICBpZiAob3B0aW9ucy51cHNlcnQgJiYgbWV0ZW9yUmVzdWx0Lmluc2VydGVkSWQpIHtcbiAgICAgICAgICAgICAgICBpZiAoa25vd25JZCkge1xuICAgICAgICAgICAgICAgICAgbWV0ZW9yUmVzdWx0Lmluc2VydGVkSWQgPSBrbm93bklkO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAobWV0ZW9yUmVzdWx0Lmluc2VydGVkSWQgaW5zdGFuY2VvZiBNb25nb0RCLk9iamVjdElEKSB7XG4gICAgICAgICAgICAgICAgICBtZXRlb3JSZXN1bHQuaW5zZXJ0ZWRJZCA9IG5ldyBNb25nby5PYmplY3RJRChtZXRlb3JSZXN1bHQuaW5zZXJ0ZWRJZC50b0hleFN0cmluZygpKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICBjYWxsYmFjayhlcnIsIG1ldGVvclJlc3VsdCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBjYWxsYmFjayhlcnIsIG1ldGVvclJlc3VsdC5udW1iZXJBZmZlY3RlZCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNhbGxiYWNrKGVycik7XG4gICAgICAgICAgfVxuICAgICAgICB9KSk7XG4gICAgfVxuICB9IGNhdGNoIChlKSB7XG4gICAgd3JpdGUuY29tbWl0dGVkKCk7XG4gICAgdGhyb3cgZTtcbiAgfVxufTtcblxudmFyIHRyYW5zZm9ybVJlc3VsdCA9IGZ1bmN0aW9uIChkcml2ZXJSZXN1bHQpIHtcbiAgdmFyIG1ldGVvclJlc3VsdCA9IHsgbnVtYmVyQWZmZWN0ZWQ6IDAgfTtcbiAgaWYgKGRyaXZlclJlc3VsdCkge1xuICAgIHZhciBtb25nb1Jlc3VsdCA9IGRyaXZlclJlc3VsdC5yZXN1bHQ7XG4gICAgLy8gT24gdXBkYXRlcyB3aXRoIHVwc2VydDp0cnVlLCB0aGUgaW5zZXJ0ZWQgdmFsdWVzIGNvbWUgYXMgYSBsaXN0IG9mXG4gICAgLy8gdXBzZXJ0ZWQgdmFsdWVzIC0tIGV2ZW4gd2l0aCBvcHRpb25zLm11bHRpLCB3aGVuIHRoZSB1cHNlcnQgZG9lcyBpbnNlcnQsXG4gICAgLy8gaXQgb25seSBpbnNlcnRzIG9uZSBlbGVtZW50LlxuICAgIGlmIChtb25nb1Jlc3VsdC51cHNlcnRlZENvdW50KSB7XG4gICAgICBtZXRlb3JSZXN1bHQubnVtYmVyQWZmZWN0ZWQgPSBtb25nb1Jlc3VsdC51cHNlcnRlZENvdW50O1xuXG4gICAgICBpZiAobW9uZ29SZXN1bHQudXBzZXJ0ZWRJZCkge1xuICAgICAgICBtZXRlb3JSZXN1bHQuaW5zZXJ0ZWRJZCA9IG1vbmdvUmVzdWx0LnVwc2VydGVkSWQ7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIG4gd2FzIHVzZWQgYmVmb3JlIE1vbmdvIDUuMCwgaW4gTW9uZ28gNS4wIHdlIGFyZSBub3QgcmVjZWl2aW5nIHRoaXMgblxuICAgICAgLy8gZmllbGQgYW5kIHNvIHdlIGFyZSB1c2luZyBtb2RpZmllZENvdW50IGluc3RlYWRcbiAgICAgIG1ldGVvclJlc3VsdC5udW1iZXJBZmZlY3RlZCA9IG1vbmdvUmVzdWx0Lm4gfHwgbW9uZ29SZXN1bHQubWF0Y2hlZENvdW50IHx8IG1vbmdvUmVzdWx0Lm1vZGlmaWVkQ291bnQ7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIG1ldGVvclJlc3VsdDtcbn07XG5cblxudmFyIE5VTV9PUFRJTUlTVElDX1RSSUVTID0gMztcblxuLy8gZXhwb3NlZCBmb3IgdGVzdGluZ1xuTW9uZ29Db25uZWN0aW9uLl9pc0Nhbm5vdENoYW5nZUlkRXJyb3IgPSBmdW5jdGlvbiAoZXJyKSB7XG5cbiAgLy8gTW9uZ28gMy4yLiogcmV0dXJucyBlcnJvciBhcyBuZXh0IE9iamVjdDpcbiAgLy8ge25hbWU6IFN0cmluZywgY29kZTogTnVtYmVyLCBlcnJtc2c6IFN0cmluZ31cbiAgLy8gT2xkZXIgTW9uZ28gcmV0dXJuczpcbiAgLy8ge25hbWU6IFN0cmluZywgY29kZTogTnVtYmVyLCBlcnI6IFN0cmluZ31cbiAgdmFyIGVycm9yID0gZXJyLmVycm1zZyB8fCBlcnIuZXJyO1xuXG4gIC8vIFdlIGRvbid0IHVzZSB0aGUgZXJyb3IgY29kZSBoZXJlXG4gIC8vIGJlY2F1c2UgdGhlIGVycm9yIGNvZGUgd2Ugb2JzZXJ2ZWQgaXQgcHJvZHVjaW5nICgxNjgzNykgYXBwZWFycyB0byBiZVxuICAvLyBhIGZhciBtb3JlIGdlbmVyaWMgZXJyb3IgY29kZSBiYXNlZCBvbiBleGFtaW5pbmcgdGhlIHNvdXJjZS5cbiAgaWYgKGVycm9yLmluZGV4T2YoJ1RoZSBfaWQgZmllbGQgY2Fubm90IGJlIGNoYW5nZWQnKSA9PT0gMFxuICAgIHx8IGVycm9yLmluZGV4T2YoXCJ0aGUgKGltbXV0YWJsZSkgZmllbGQgJ19pZCcgd2FzIGZvdW5kIHRvIGhhdmUgYmVlbiBhbHRlcmVkIHRvIF9pZFwiKSAhPT0gLTEpIHtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIHJldHVybiBmYWxzZTtcbn07XG5cbnZhciBzaW11bGF0ZVVwc2VydFdpdGhJbnNlcnRlZElkID0gZnVuY3Rpb24gKGNvbGxlY3Rpb24sIHNlbGVjdG9yLCBtb2QsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBvcHRpb25zLCBjYWxsYmFjaykge1xuICAvLyBTVFJBVEVHWTogRmlyc3QgdHJ5IGRvaW5nIGFuIHVwc2VydCB3aXRoIGEgZ2VuZXJhdGVkIElELlxuICAvLyBJZiB0aGlzIHRocm93cyBhbiBlcnJvciBhYm91dCBjaGFuZ2luZyB0aGUgSUQgb24gYW4gZXhpc3RpbmcgZG9jdW1lbnRcbiAgLy8gdGhlbiB3aXRob3V0IGFmZmVjdGluZyB0aGUgZGF0YWJhc2UsIHdlIGtub3cgd2Ugc2hvdWxkIHByb2JhYmx5IHRyeVxuICAvLyBhbiB1cGRhdGUgd2l0aG91dCB0aGUgZ2VuZXJhdGVkIElELiBJZiBpdCBhZmZlY3RlZCAwIGRvY3VtZW50cyxcbiAgLy8gdGhlbiB3aXRob3V0IGFmZmVjdGluZyB0aGUgZGF0YWJhc2UsIHdlIHRoZSBkb2N1bWVudCB0aGF0IGZpcnN0XG4gIC8vIGdhdmUgdGhlIGVycm9yIGlzIHByb2JhYmx5IHJlbW92ZWQgYW5kIHdlIG5lZWQgdG8gdHJ5IGFuIGluc2VydCBhZ2FpblxuICAvLyBXZSBnbyBiYWNrIHRvIHN0ZXAgb25lIGFuZCByZXBlYXQuXG4gIC8vIExpa2UgYWxsIFwib3B0aW1pc3RpYyB3cml0ZVwiIHNjaGVtZXMsIHdlIHJlbHkgb24gdGhlIGZhY3QgdGhhdCBpdCdzXG4gIC8vIHVubGlrZWx5IG91ciB3cml0ZXMgd2lsbCBjb250aW51ZSB0byBiZSBpbnRlcmZlcmVkIHdpdGggdW5kZXIgbm9ybWFsXG4gIC8vIGNpcmN1bXN0YW5jZXMgKHRob3VnaCBzdWZmaWNpZW50bHkgaGVhdnkgY29udGVudGlvbiB3aXRoIHdyaXRlcnNcbiAgLy8gZGlzYWdyZWVpbmcgb24gdGhlIGV4aXN0ZW5jZSBvZiBhbiBvYmplY3Qgd2lsbCBjYXVzZSB3cml0ZXMgdG8gZmFpbFxuICAvLyBpbiB0aGVvcnkpLlxuXG4gIHZhciBpbnNlcnRlZElkID0gb3B0aW9ucy5pbnNlcnRlZElkOyAvLyBtdXN0IGV4aXN0XG4gIHZhciBtb25nb09wdHNGb3JVcGRhdGUgPSB7XG4gICAgc2FmZTogdHJ1ZSxcbiAgICBtdWx0aTogb3B0aW9ucy5tdWx0aVxuICB9O1xuICB2YXIgbW9uZ29PcHRzRm9ySW5zZXJ0ID0ge1xuICAgIHNhZmU6IHRydWUsXG4gICAgdXBzZXJ0OiB0cnVlXG4gIH07XG5cbiAgdmFyIHJlcGxhY2VtZW50V2l0aElkID0gT2JqZWN0LmFzc2lnbihcbiAgICByZXBsYWNlVHlwZXMoe19pZDogaW5zZXJ0ZWRJZH0sIHJlcGxhY2VNZXRlb3JBdG9tV2l0aE1vbmdvKSxcbiAgICBtb2QpO1xuXG4gIHZhciB0cmllcyA9IE5VTV9PUFRJTUlTVElDX1RSSUVTO1xuXG4gIHZhciBkb1VwZGF0ZSA9IGZ1bmN0aW9uICgpIHtcbiAgICB0cmllcy0tO1xuICAgIGlmICghIHRyaWVzKSB7XG4gICAgICBjYWxsYmFjayhuZXcgRXJyb3IoXCJVcHNlcnQgZmFpbGVkIGFmdGVyIFwiICsgTlVNX09QVElNSVNUSUNfVFJJRVMgKyBcIiB0cmllcy5cIikpO1xuICAgIH0gZWxzZSB7XG4gICAgICBsZXQgbWV0aG9kID0gY29sbGVjdGlvbi51cGRhdGVNYW55O1xuICAgICAgaWYoIU9iamVjdC5rZXlzKG1vZCkuc29tZShrZXkgPT4ga2V5LnN0YXJ0c1dpdGgoXCIkXCIpKSl7XG4gICAgICAgIG1ldGhvZCA9IGNvbGxlY3Rpb24ucmVwbGFjZU9uZS5iaW5kKGNvbGxlY3Rpb24pO1xuICAgICAgfVxuICAgICAgbWV0aG9kKFxuICAgICAgICBzZWxlY3RvcixcbiAgICAgICAgbW9kLFxuICAgICAgICBtb25nb09wdHNGb3JVcGRhdGUsXG4gICAgICAgIGJpbmRFbnZpcm9ubWVudEZvcldyaXRlKGZ1bmN0aW9uKGVyciwgcmVzdWx0KSB7XG4gICAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgY2FsbGJhY2soZXJyKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKHJlc3VsdCAmJiAocmVzdWx0Lm1vZGlmaWVkQ291bnQgfHwgcmVzdWx0LnVwc2VydGVkQ291bnQpKSB7XG4gICAgICAgICAgICBjYWxsYmFjayhudWxsLCB7XG4gICAgICAgICAgICAgIG51bWJlckFmZmVjdGVkOiByZXN1bHQubW9kaWZpZWRDb3VudCB8fCByZXN1bHQudXBzZXJ0ZWRDb3VudCxcbiAgICAgICAgICAgICAgaW5zZXJ0ZWRJZDogcmVzdWx0LnVwc2VydGVkSWQgfHwgdW5kZWZpbmVkLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGRvQ29uZGl0aW9uYWxJbnNlcnQoKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pXG4gICAgICApO1xuICAgIH1cbiAgfTtcblxuICB2YXIgZG9Db25kaXRpb25hbEluc2VydCA9IGZ1bmN0aW9uKCkge1xuICAgIGNvbGxlY3Rpb24ucmVwbGFjZU9uZShcbiAgICAgIHNlbGVjdG9yLFxuICAgICAgcmVwbGFjZW1lbnRXaXRoSWQsXG4gICAgICBtb25nb09wdHNGb3JJbnNlcnQsXG4gICAgICBiaW5kRW52aXJvbm1lbnRGb3JXcml0ZShmdW5jdGlvbihlcnIsIHJlc3VsdCkge1xuICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgLy8gZmlndXJlIG91dCBpZiB0aGlzIGlzIGFcbiAgICAgICAgICAvLyBcImNhbm5vdCBjaGFuZ2UgX2lkIG9mIGRvY3VtZW50XCIgZXJyb3IsIGFuZFxuICAgICAgICAgIC8vIGlmIHNvLCB0cnkgZG9VcGRhdGUoKSBhZ2FpbiwgdXAgdG8gMyB0aW1lcy5cbiAgICAgICAgICBpZiAoTW9uZ29Db25uZWN0aW9uLl9pc0Nhbm5vdENoYW5nZUlkRXJyb3IoZXJyKSkge1xuICAgICAgICAgICAgZG9VcGRhdGUoKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY2FsbGJhY2soZXJyKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY2FsbGJhY2sobnVsbCwge1xuICAgICAgICAgICAgbnVtYmVyQWZmZWN0ZWQ6IHJlc3VsdC51cHNlcnRlZENvdW50LFxuICAgICAgICAgICAgaW5zZXJ0ZWRJZDogcmVzdWx0LnVwc2VydGVkSWQsXG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgKTtcbiAgfTtcblxuICBkb1VwZGF0ZSgpO1xufTtcblxuXy5lYWNoKFtcImluc2VydFwiLCBcInVwZGF0ZVwiLCBcInJlbW92ZVwiLCBcImRyb3BDb2xsZWN0aW9uXCIsIFwiZHJvcERhdGFiYXNlXCJdLCBmdW5jdGlvbiAobWV0aG9kKSB7XG4gIE1vbmdvQ29ubmVjdGlvbi5wcm90b3R5cGVbbWV0aG9kXSA9IGZ1bmN0aW9uICgvKiBhcmd1bWVudHMgKi8pIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgcmV0dXJuIE1ldGVvci53cmFwQXN5bmMoc2VsZltcIl9cIiArIG1ldGhvZF0pLmFwcGx5KHNlbGYsIGFyZ3VtZW50cyk7XG4gIH07XG59KTtcblxuLy8gWFhYIE1vbmdvQ29ubmVjdGlvbi51cHNlcnQoKSBkb2VzIG5vdCByZXR1cm4gdGhlIGlkIG9mIHRoZSBpbnNlcnRlZCBkb2N1bWVudFxuLy8gdW5sZXNzIHlvdSBzZXQgaXQgZXhwbGljaXRseSBpbiB0aGUgc2VsZWN0b3Igb3IgbW9kaWZpZXIgKGFzIGEgcmVwbGFjZW1lbnRcbi8vIGRvYykuXG5Nb25nb0Nvbm5lY3Rpb24ucHJvdG90eXBlLnVwc2VydCA9IGZ1bmN0aW9uIChjb2xsZWN0aW9uTmFtZSwgc2VsZWN0b3IsIG1vZCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG9wdGlvbnMsIGNhbGxiYWNrKSB7XG4gIHZhciBzZWxmID0gdGhpcztcblxuXG4gIFxuICBpZiAodHlwZW9mIG9wdGlvbnMgPT09IFwiZnVuY3Rpb25cIiAmJiAhIGNhbGxiYWNrKSB7XG4gICAgY2FsbGJhY2sgPSBvcHRpb25zO1xuICAgIG9wdGlvbnMgPSB7fTtcbiAgfVxuXG4gIHJldHVybiBzZWxmLnVwZGF0ZShjb2xsZWN0aW9uTmFtZSwgc2VsZWN0b3IsIG1vZCxcbiAgICAgICAgICAgICAgICAgICAgIF8uZXh0ZW5kKHt9LCBvcHRpb25zLCB7XG4gICAgICAgICAgICAgICAgICAgICAgIHVwc2VydDogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgX3JldHVybk9iamVjdDogdHJ1ZVxuICAgICAgICAgICAgICAgICAgICAgfSksIGNhbGxiYWNrKTtcbn07XG5cbk1vbmdvQ29ubmVjdGlvbi5wcm90b3R5cGUuZmluZCA9IGZ1bmN0aW9uIChjb2xsZWN0aW9uTmFtZSwgc2VsZWN0b3IsIG9wdGlvbnMpIHtcbiAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gIGlmIChhcmd1bWVudHMubGVuZ3RoID09PSAxKVxuICAgIHNlbGVjdG9yID0ge307XG5cbiAgcmV0dXJuIG5ldyBDdXJzb3IoXG4gICAgc2VsZiwgbmV3IEN1cnNvckRlc2NyaXB0aW9uKGNvbGxlY3Rpb25OYW1lLCBzZWxlY3Rvciwgb3B0aW9ucykpO1xufTtcblxuTW9uZ29Db25uZWN0aW9uLnByb3RvdHlwZS5maW5kT25lQXN5bmMgPSBhc3luYyBmdW5jdGlvbiAoY29sbGVjdGlvbl9uYW1lLCBzZWxlY3RvcixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgb3B0aW9ucykge1xuICB2YXIgc2VsZiA9IHRoaXM7XG4gIGlmIChhcmd1bWVudHMubGVuZ3RoID09PSAxKVxuICAgIHNlbGVjdG9yID0ge307XG5cbiAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gIG9wdGlvbnMubGltaXQgPSAxO1xuICByZXR1cm4gKGF3YWl0IHNlbGYuZmluZChjb2xsZWN0aW9uX25hbWUsIHNlbGVjdG9yLCBvcHRpb25zKS5mZXRjaEFzeW5jKCkpWzBdO1xufTtcblxuTW9uZ29Db25uZWN0aW9uLnByb3RvdHlwZS5maW5kT25lID0gZnVuY3Rpb24gKGNvbGxlY3Rpb25fbmFtZSwgc2VsZWN0b3IsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgb3B0aW9ucykge1xuICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgcmV0dXJuIEZ1dHVyZS5mcm9tUHJvbWlzZShzZWxmLmZpbmRPbmVBc3luYyhjb2xsZWN0aW9uX25hbWUsIHNlbGVjdG9yLCBvcHRpb25zKSkud2FpdCgpO1xufTtcblxuTW9uZ29Db25uZWN0aW9uLnByb3RvdHlwZS5jcmVhdGVJbmRleEFzeW5jID0gZnVuY3Rpb24gKGNvbGxlY3Rpb25OYW1lLCBpbmRleCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgb3B0aW9ucykge1xuICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgLy8gV2UgZXhwZWN0IHRoaXMgZnVuY3Rpb24gdG8gYmUgY2FsbGVkIGF0IHN0YXJ0dXAsIG5vdCBmcm9tIHdpdGhpbiBhIG1ldGhvZCxcbiAgLy8gc28gd2UgZG9uJ3QgaW50ZXJhY3Qgd2l0aCB0aGUgd3JpdGUgZmVuY2UuXG4gIHZhciBjb2xsZWN0aW9uID0gc2VsZi5yYXdDb2xsZWN0aW9uKGNvbGxlY3Rpb25OYW1lKTtcbiAgcmV0dXJuIGNvbGxlY3Rpb24uY3JlYXRlSW5kZXgoaW5kZXgsIG9wdGlvbnMpO1xufTtcblxuLy8gV2UnbGwgYWN0dWFsbHkgZGVzaWduIGFuIGluZGV4IEFQSSBsYXRlci4gRm9yIG5vdywgd2UganVzdCBwYXNzIHRocm91Z2ggdG9cbi8vIE1vbmdvJ3MsIGJ1dCBtYWtlIGl0IHN5bmNocm9ub3VzLlxuTW9uZ29Db25uZWN0aW9uLnByb3RvdHlwZS5jcmVhdGVJbmRleCA9IGZ1bmN0aW9uIChjb2xsZWN0aW9uTmFtZSwgaW5kZXgsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBvcHRpb25zKSB7XG4gIHZhciBzZWxmID0gdGhpcztcbiAgXG5cbiAgcmV0dXJuIEZ1dHVyZS5mcm9tUHJvbWlzZShzZWxmLmNyZWF0ZUluZGV4QXN5bmMoY29sbGVjdGlvbk5hbWUsIGluZGV4LCBvcHRpb25zKSk7XG59O1xuXG5Nb25nb0Nvbm5lY3Rpb24ucHJvdG90eXBlLmNvdW50RG9jdW1lbnRzID0gZnVuY3Rpb24gKGNvbGxlY3Rpb25OYW1lLCAuLi5hcmdzKSB7XG4gIGFyZ3MgPSBhcmdzLm1hcChhcmcgPT4gcmVwbGFjZVR5cGVzKGFyZywgcmVwbGFjZU1ldGVvckF0b21XaXRoTW9uZ28pKTtcbiAgY29uc3QgY29sbGVjdGlvbiA9IHRoaXMucmF3Q29sbGVjdGlvbihjb2xsZWN0aW9uTmFtZSk7XG4gIHJldHVybiBjb2xsZWN0aW9uLmNvdW50RG9jdW1lbnRzKC4uLmFyZ3MpO1xufTtcblxuTW9uZ29Db25uZWN0aW9uLnByb3RvdHlwZS5lc3RpbWF0ZWREb2N1bWVudENvdW50ID0gZnVuY3Rpb24gKGNvbGxlY3Rpb25OYW1lLCAuLi5hcmdzKSB7XG4gIGFyZ3MgPSBhcmdzLm1hcChhcmcgPT4gcmVwbGFjZVR5cGVzKGFyZywgcmVwbGFjZU1ldGVvckF0b21XaXRoTW9uZ28pKTtcbiAgY29uc3QgY29sbGVjdGlvbiA9IHRoaXMucmF3Q29sbGVjdGlvbihjb2xsZWN0aW9uTmFtZSk7XG4gIHJldHVybiBjb2xsZWN0aW9uLmVzdGltYXRlZERvY3VtZW50Q291bnQoLi4uYXJncyk7XG59O1xuXG5Nb25nb0Nvbm5lY3Rpb24ucHJvdG90eXBlLl9lbnN1cmVJbmRleCA9IE1vbmdvQ29ubmVjdGlvbi5wcm90b3R5cGUuY3JlYXRlSW5kZXg7XG5cbk1vbmdvQ29ubmVjdGlvbi5wcm90b3R5cGUuX2Ryb3BJbmRleCA9IGZ1bmN0aW9uIChjb2xsZWN0aW9uTmFtZSwgaW5kZXgpIHtcbiAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gIFxuICAvLyBUaGlzIGZ1bmN0aW9uIGlzIG9ubHkgdXNlZCBieSB0ZXN0IGNvZGUsIG5vdCB3aXRoaW4gYSBtZXRob2QsIHNvIHdlIGRvbid0XG4gIC8vIGludGVyYWN0IHdpdGggdGhlIHdyaXRlIGZlbmNlLlxuICB2YXIgY29sbGVjdGlvbiA9IHNlbGYucmF3Q29sbGVjdGlvbihjb2xsZWN0aW9uTmFtZSk7XG4gIHZhciBmdXR1cmUgPSBuZXcgRnV0dXJlO1xuICB2YXIgaW5kZXhOYW1lID0gY29sbGVjdGlvbi5kcm9wSW5kZXgoaW5kZXgsIGZ1dHVyZS5yZXNvbHZlcigpKTtcbiAgZnV0dXJlLndhaXQoKTtcbn07XG5cbi8vIENVUlNPUlNcblxuLy8gVGhlcmUgYXJlIHNldmVyYWwgY2xhc3NlcyB3aGljaCByZWxhdGUgdG8gY3Vyc29yczpcbi8vXG4vLyBDdXJzb3JEZXNjcmlwdGlvbiByZXByZXNlbnRzIHRoZSBhcmd1bWVudHMgdXNlZCB0byBjb25zdHJ1Y3QgYSBjdXJzb3I6XG4vLyBjb2xsZWN0aW9uTmFtZSwgc2VsZWN0b3IsIGFuZCAoZmluZCkgb3B0aW9ucy4gIEJlY2F1c2UgaXQgaXMgdXNlZCBhcyBhIGtleVxuLy8gZm9yIGN1cnNvciBkZS1kdXAsIGV2ZXJ5dGhpbmcgaW4gaXQgc2hvdWxkIGVpdGhlciBiZSBKU09OLXN0cmluZ2lmaWFibGUgb3Jcbi8vIG5vdCBhZmZlY3Qgb2JzZXJ2ZUNoYW5nZXMgb3V0cHV0IChlZywgb3B0aW9ucy50cmFuc2Zvcm0gZnVuY3Rpb25zIGFyZSBub3Rcbi8vIHN0cmluZ2lmaWFibGUgYnV0IGRvIG5vdCBhZmZlY3Qgb2JzZXJ2ZUNoYW5nZXMpLlxuLy9cbi8vIFN5bmNocm9ub3VzQ3Vyc29yIGlzIGEgd3JhcHBlciBhcm91bmQgYSBNb25nb0RCIGN1cnNvclxuLy8gd2hpY2ggaW5jbHVkZXMgZnVsbHktc3luY2hyb25vdXMgdmVyc2lvbnMgb2YgZm9yRWFjaCwgZXRjLlxuLy9cbi8vIEN1cnNvciBpcyB0aGUgY3Vyc29yIG9iamVjdCByZXR1cm5lZCBmcm9tIGZpbmQoKSwgd2hpY2ggaW1wbGVtZW50cyB0aGVcbi8vIGRvY3VtZW50ZWQgTW9uZ28uQ29sbGVjdGlvbiBjdXJzb3IgQVBJLiAgSXQgd3JhcHMgYSBDdXJzb3JEZXNjcmlwdGlvbiBhbmQgYVxuLy8gU3luY2hyb25vdXNDdXJzb3IgKGxhemlseTogaXQgZG9lc24ndCBjb250YWN0IE1vbmdvIHVudGlsIHlvdSBjYWxsIGEgbWV0aG9kXG4vLyBsaWtlIGZldGNoIG9yIGZvckVhY2ggb24gaXQpLlxuLy9cbi8vIE9ic2VydmVIYW5kbGUgaXMgdGhlIFwib2JzZXJ2ZSBoYW5kbGVcIiByZXR1cm5lZCBmcm9tIG9ic2VydmVDaGFuZ2VzLiBJdCBoYXMgYVxuLy8gcmVmZXJlbmNlIHRvIGFuIE9ic2VydmVNdWx0aXBsZXhlci5cbi8vXG4vLyBPYnNlcnZlTXVsdGlwbGV4ZXIgYWxsb3dzIG11bHRpcGxlIGlkZW50aWNhbCBPYnNlcnZlSGFuZGxlcyB0byBiZSBkcml2ZW4gYnkgYVxuLy8gc2luZ2xlIG9ic2VydmUgZHJpdmVyLlxuLy9cbi8vIFRoZXJlIGFyZSB0d28gXCJvYnNlcnZlIGRyaXZlcnNcIiB3aGljaCBkcml2ZSBPYnNlcnZlTXVsdGlwbGV4ZXJzOlxuLy8gICAtIFBvbGxpbmdPYnNlcnZlRHJpdmVyIGNhY2hlcyB0aGUgcmVzdWx0cyBvZiBhIHF1ZXJ5IGFuZCByZXJ1bnMgaXQgd2hlblxuLy8gICAgIG5lY2Vzc2FyeS5cbi8vICAgLSBPcGxvZ09ic2VydmVEcml2ZXIgZm9sbG93cyB0aGUgTW9uZ28gb3BlcmF0aW9uIGxvZyB0byBkaXJlY3RseSBvYnNlcnZlXG4vLyAgICAgZGF0YWJhc2UgY2hhbmdlcy5cbi8vIEJvdGggaW1wbGVtZW50YXRpb25zIGZvbGxvdyB0aGUgc2FtZSBzaW1wbGUgaW50ZXJmYWNlOiB3aGVuIHlvdSBjcmVhdGUgdGhlbSxcbi8vIHRoZXkgc3RhcnQgc2VuZGluZyBvYnNlcnZlQ2hhbmdlcyBjYWxsYmFja3MgKGFuZCBhIHJlYWR5KCkgaW52b2NhdGlvbikgdG9cbi8vIHRoZWlyIE9ic2VydmVNdWx0aXBsZXhlciwgYW5kIHlvdSBzdG9wIHRoZW0gYnkgY2FsbGluZyB0aGVpciBzdG9wKCkgbWV0aG9kLlxuXG5DdXJzb3JEZXNjcmlwdGlvbiA9IGZ1bmN0aW9uIChjb2xsZWN0aW9uTmFtZSwgc2VsZWN0b3IsIG9wdGlvbnMpIHtcbiAgdmFyIHNlbGYgPSB0aGlzO1xuICBzZWxmLmNvbGxlY3Rpb25OYW1lID0gY29sbGVjdGlvbk5hbWU7XG4gIHNlbGYuc2VsZWN0b3IgPSBNb25nby5Db2xsZWN0aW9uLl9yZXdyaXRlU2VsZWN0b3Ioc2VsZWN0b3IpO1xuICBzZWxmLm9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xufTtcblxuQ3Vyc29yID0gZnVuY3Rpb24gKG1vbmdvLCBjdXJzb3JEZXNjcmlwdGlvbikge1xuICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgc2VsZi5fbW9uZ28gPSBtb25nbztcbiAgc2VsZi5fY3Vyc29yRGVzY3JpcHRpb24gPSBjdXJzb3JEZXNjcmlwdGlvbjtcbiAgc2VsZi5fc3luY2hyb25vdXNDdXJzb3IgPSBudWxsO1xufTtcblxuZnVuY3Rpb24gc2V0dXBTeW5jaHJvbm91c0N1cnNvcihjdXJzb3IsIG1ldGhvZCkge1xuICAvLyBZb3UgY2FuIG9ubHkgb2JzZXJ2ZSBhIHRhaWxhYmxlIGN1cnNvci5cbiAgaWYgKGN1cnNvci5fY3Vyc29yRGVzY3JpcHRpb24ub3B0aW9ucy50YWlsYWJsZSlcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0Nhbm5vdCBjYWxsICcgKyBtZXRob2QgKyAnIG9uIGEgdGFpbGFibGUgY3Vyc29yJyk7XG5cbiAgaWYgKCFjdXJzb3IuX3N5bmNocm9ub3VzQ3Vyc29yKSB7XG4gICAgY3Vyc29yLl9zeW5jaHJvbm91c0N1cnNvciA9IGN1cnNvci5fbW9uZ28uX2NyZWF0ZVN5bmNocm9ub3VzQ3Vyc29yKFxuICAgICAgY3Vyc29yLl9jdXJzb3JEZXNjcmlwdGlvbixcbiAgICAgIHtcbiAgICAgICAgLy8gTWFrZSBzdXJlIHRoYXQgdGhlIFwiY3Vyc29yXCIgYXJndW1lbnQgdG8gZm9yRWFjaC9tYXAgY2FsbGJhY2tzIGlzIHRoZVxuICAgICAgICAvLyBDdXJzb3IsIG5vdCB0aGUgU3luY2hyb25vdXNDdXJzb3IuXG4gICAgICAgIHNlbGZGb3JJdGVyYXRpb246IGN1cnNvcixcbiAgICAgICAgdXNlVHJhbnNmb3JtOiB0cnVlLFxuICAgICAgfVxuICAgICk7XG4gIH1cblxuICByZXR1cm4gY3Vyc29yLl9zeW5jaHJvbm91c0N1cnNvcjtcbn1cblxuXG5DdXJzb3IucHJvdG90eXBlLmNvdW50ID0gZnVuY3Rpb24gKCkge1xuXG4gIGNvbnN0IGNvbGxlY3Rpb24gPSB0aGlzLl9tb25nby5yYXdDb2xsZWN0aW9uKHRoaXMuX2N1cnNvckRlc2NyaXB0aW9uLmNvbGxlY3Rpb25OYW1lKTtcbiAgcmV0dXJuIFByb21pc2UuYXdhaXQoY29sbGVjdGlvbi5jb3VudERvY3VtZW50cyhcbiAgICByZXBsYWNlVHlwZXModGhpcy5fY3Vyc29yRGVzY3JpcHRpb24uc2VsZWN0b3IsIHJlcGxhY2VNZXRlb3JBdG9tV2l0aE1vbmdvKSxcbiAgICByZXBsYWNlVHlwZXModGhpcy5fY3Vyc29yRGVzY3JpcHRpb24ub3B0aW9ucywgcmVwbGFjZU1ldGVvckF0b21XaXRoTW9uZ28pLFxuICApKTtcbn07XG5cblsuLi5BU1lOQ19DVVJTT1JfTUVUSE9EUywgU3ltYm9sLml0ZXJhdG9yLCBTeW1ib2wuYXN5bmNJdGVyYXRvcl0uZm9yRWFjaChtZXRob2ROYW1lID0+IHtcbiAgLy8gY291bnQgaXMgaGFuZGxlZCBzcGVjaWFsbHkgc2luY2Ugd2UgZG9uJ3Qgd2FudCB0byBjcmVhdGUgYSBjdXJzb3IuXG4gIC8vIGl0IGlzIHN0aWxsIGluY2x1ZGVkIGluIEFTWU5DX0NVUlNPUl9NRVRIT0RTIGJlY2F1c2Ugd2Ugc3RpbGwgd2FudCBhbiBhc3luYyB2ZXJzaW9uIG9mIGl0IHRvIGV4aXN0LlxuICBpZiAobWV0aG9kTmFtZSAhPT0gJ2NvdW50Jykge1xuICAgIEN1cnNvci5wcm90b3R5cGVbbWV0aG9kTmFtZV0gPSBmdW5jdGlvbiAoLi4uYXJncykge1xuICAgICAgY29uc3QgY3Vyc29yID0gc2V0dXBTeW5jaHJvbm91c0N1cnNvcih0aGlzLCBtZXRob2ROYW1lKTtcbiAgICAgIHJldHVybiBjdXJzb3JbbWV0aG9kTmFtZV0oLi4uYXJncyk7XG4gICAgfTtcbiAgfVxuXG4gIC8vIFRoZXNlIG1ldGhvZHMgYXJlIGhhbmRsZWQgc2VwYXJhdGVseS5cbiAgaWYgKG1ldGhvZE5hbWUgPT09IFN5bWJvbC5pdGVyYXRvciB8fCBtZXRob2ROYW1lID09PSBTeW1ib2wuYXN5bmNJdGVyYXRvcikge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGNvbnN0IG1ldGhvZE5hbWVBc3luYyA9IGdldEFzeW5jTWV0aG9kTmFtZShtZXRob2ROYW1lKTtcbiAgQ3Vyc29yLnByb3RvdHlwZVttZXRob2ROYW1lQXN5bmNdID0gZnVuY3Rpb24gKC4uLmFyZ3MpIHtcbiAgICB0cnkge1xuICAgICAgdGhpc1ttZXRob2ROYW1lXS5pc0NhbGxlZEZyb21Bc3luYyA9IHRydWU7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRoaXNbbWV0aG9kTmFtZV0oLi4uYXJncykpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoZXJyb3IpO1xuICAgIH1cbiAgfTtcbn0pO1xuXG5DdXJzb3IucHJvdG90eXBlLmdldFRyYW5zZm9ybSA9IGZ1bmN0aW9uICgpIHtcbiAgcmV0dXJuIHRoaXMuX2N1cnNvckRlc2NyaXB0aW9uLm9wdGlvbnMudHJhbnNmb3JtO1xufTtcblxuLy8gV2hlbiB5b3UgY2FsbCBNZXRlb3IucHVibGlzaCgpIHdpdGggYSBmdW5jdGlvbiB0aGF0IHJldHVybnMgYSBDdXJzb3IsIHdlIG5lZWRcbi8vIHRvIHRyYW5zbXV0ZSBpdCBpbnRvIHRoZSBlcXVpdmFsZW50IHN1YnNjcmlwdGlvbi4gIFRoaXMgaXMgdGhlIGZ1bmN0aW9uIHRoYXRcbi8vIGRvZXMgdGhhdC5cblxuQ3Vyc29yLnByb3RvdHlwZS5fcHVibGlzaEN1cnNvciA9IGZ1bmN0aW9uIChzdWIpIHtcbiAgdmFyIHNlbGYgPSB0aGlzO1xuICB2YXIgY29sbGVjdGlvbiA9IHNlbGYuX2N1cnNvckRlc2NyaXB0aW9uLmNvbGxlY3Rpb25OYW1lO1xuICByZXR1cm4gTW9uZ28uQ29sbGVjdGlvbi5fcHVibGlzaEN1cnNvcihzZWxmLCBzdWIsIGNvbGxlY3Rpb24pO1xufTtcblxuLy8gVXNlZCB0byBndWFyYW50ZWUgdGhhdCBwdWJsaXNoIGZ1bmN0aW9ucyByZXR1cm4gYXQgbW9zdCBvbmUgY3Vyc29yIHBlclxuLy8gY29sbGVjdGlvbi4gUHJpdmF0ZSwgYmVjYXVzZSB3ZSBtaWdodCBsYXRlciBoYXZlIGN1cnNvcnMgdGhhdCBpbmNsdWRlXG4vLyBkb2N1bWVudHMgZnJvbSBtdWx0aXBsZSBjb2xsZWN0aW9ucyBzb21laG93LlxuQ3Vyc29yLnByb3RvdHlwZS5fZ2V0Q29sbGVjdGlvbk5hbWUgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBzZWxmID0gdGhpcztcbiAgcmV0dXJuIHNlbGYuX2N1cnNvckRlc2NyaXB0aW9uLmNvbGxlY3Rpb25OYW1lO1xufTtcblxuQ3Vyc29yLnByb3RvdHlwZS5vYnNlcnZlID0gZnVuY3Rpb24gKGNhbGxiYWNrcykge1xuICB2YXIgc2VsZiA9IHRoaXM7XG4gIHJldHVybiBMb2NhbENvbGxlY3Rpb24uX29ic2VydmVGcm9tT2JzZXJ2ZUNoYW5nZXMoc2VsZiwgY2FsbGJhY2tzKTtcbn07XG5cbkN1cnNvci5wcm90b3R5cGUub2JzZXJ2ZUNoYW5nZXMgPSBmdW5jdGlvbiAoY2FsbGJhY2tzLCBvcHRpb25zID0ge30pIHtcbiAgdmFyIHNlbGYgPSB0aGlzO1xuICB2YXIgbWV0aG9kcyA9IFtcbiAgICAnYWRkZWRBdCcsXG4gICAgJ2FkZGVkJyxcbiAgICAnY2hhbmdlZEF0JyxcbiAgICAnY2hhbmdlZCcsXG4gICAgJ3JlbW92ZWRBdCcsXG4gICAgJ3JlbW92ZWQnLFxuICAgICdtb3ZlZFRvJ1xuICBdO1xuICB2YXIgb3JkZXJlZCA9IExvY2FsQ29sbGVjdGlvbi5fb2JzZXJ2ZUNoYW5nZXNDYWxsYmFja3NBcmVPcmRlcmVkKGNhbGxiYWNrcyk7XG5cbiAgbGV0IGV4Y2VwdGlvbk5hbWUgPSBjYWxsYmFja3MuX2Zyb21PYnNlcnZlID8gJ29ic2VydmUnIDogJ29ic2VydmVDaGFuZ2VzJztcbiAgZXhjZXB0aW9uTmFtZSArPSAnIGNhbGxiYWNrJztcbiAgbWV0aG9kcy5mb3JFYWNoKGZ1bmN0aW9uIChtZXRob2QpIHtcbiAgICBpZiAoY2FsbGJhY2tzW21ldGhvZF0gJiYgdHlwZW9mIGNhbGxiYWNrc1ttZXRob2RdID09IFwiZnVuY3Rpb25cIikge1xuICAgICAgY2FsbGJhY2tzW21ldGhvZF0gPSBNZXRlb3IuYmluZEVudmlyb25tZW50KGNhbGxiYWNrc1ttZXRob2RdLCBtZXRob2QgKyBleGNlcHRpb25OYW1lKTtcbiAgICB9XG4gIH0pO1xuXG4gIHJldHVybiBzZWxmLl9tb25nby5fb2JzZXJ2ZUNoYW5nZXMoXG4gICAgc2VsZi5fY3Vyc29yRGVzY3JpcHRpb24sIG9yZGVyZWQsIGNhbGxiYWNrcywgb3B0aW9ucy5ub25NdXRhdGluZ0NhbGxiYWNrcyk7XG59O1xuXG5Nb25nb0Nvbm5lY3Rpb24ucHJvdG90eXBlLl9jcmVhdGVTeW5jaHJvbm91c0N1cnNvciA9IGZ1bmN0aW9uKFxuICAgIGN1cnNvckRlc2NyaXB0aW9uLCBvcHRpb25zKSB7XG4gIHZhciBzZWxmID0gdGhpcztcbiAgb3B0aW9ucyA9IF8ucGljayhvcHRpb25zIHx8IHt9LCAnc2VsZkZvckl0ZXJhdGlvbicsICd1c2VUcmFuc2Zvcm0nKTtcblxuICB2YXIgY29sbGVjdGlvbiA9IHNlbGYucmF3Q29sbGVjdGlvbihjdXJzb3JEZXNjcmlwdGlvbi5jb2xsZWN0aW9uTmFtZSk7XG4gIHZhciBjdXJzb3JPcHRpb25zID0gY3Vyc29yRGVzY3JpcHRpb24ub3B0aW9ucztcbiAgdmFyIG1vbmdvT3B0aW9ucyA9IHtcbiAgICBzb3J0OiBjdXJzb3JPcHRpb25zLnNvcnQsXG4gICAgbGltaXQ6IGN1cnNvck9wdGlvbnMubGltaXQsXG4gICAgc2tpcDogY3Vyc29yT3B0aW9ucy5za2lwLFxuICAgIHByb2plY3Rpb246IGN1cnNvck9wdGlvbnMuZmllbGRzIHx8IGN1cnNvck9wdGlvbnMucHJvamVjdGlvbixcbiAgICByZWFkUHJlZmVyZW5jZTogY3Vyc29yT3B0aW9ucy5yZWFkUHJlZmVyZW5jZSxcbiAgfTtcblxuICAvLyBEbyB3ZSB3YW50IGEgdGFpbGFibGUgY3Vyc29yICh3aGljaCBvbmx5IHdvcmtzIG9uIGNhcHBlZCBjb2xsZWN0aW9ucyk/XG4gIGlmIChjdXJzb3JPcHRpb25zLnRhaWxhYmxlKSB7XG4gICAgbW9uZ29PcHRpb25zLm51bWJlck9mUmV0cmllcyA9IC0xO1xuICB9XG5cbiAgdmFyIGRiQ3Vyc29yID0gY29sbGVjdGlvbi5maW5kKFxuICAgIHJlcGxhY2VUeXBlcyhjdXJzb3JEZXNjcmlwdGlvbi5zZWxlY3RvciwgcmVwbGFjZU1ldGVvckF0b21XaXRoTW9uZ28pLFxuICAgIG1vbmdvT3B0aW9ucyk7XG5cbiAgLy8gRG8gd2Ugd2FudCBhIHRhaWxhYmxlIGN1cnNvciAod2hpY2ggb25seSB3b3JrcyBvbiBjYXBwZWQgY29sbGVjdGlvbnMpP1xuICBpZiAoY3Vyc29yT3B0aW9ucy50YWlsYWJsZSkge1xuICAgIC8vIFdlIHdhbnQgYSB0YWlsYWJsZSBjdXJzb3IuLi5cbiAgICBkYkN1cnNvci5hZGRDdXJzb3JGbGFnKFwidGFpbGFibGVcIiwgdHJ1ZSlcbiAgICAvLyAuLi4gYW5kIGZvciB0aGUgc2VydmVyIHRvIHdhaXQgYSBiaXQgaWYgYW55IGdldE1vcmUgaGFzIG5vIGRhdGEgKHJhdGhlclxuICAgIC8vIHRoYW4gbWFraW5nIHVzIHB1dCB0aGUgcmVsZXZhbnQgc2xlZXBzIGluIHRoZSBjbGllbnQpLi4uXG4gICAgZGJDdXJzb3IuYWRkQ3Vyc29yRmxhZyhcImF3YWl0RGF0YVwiLCB0cnVlKVxuXG4gICAgLy8gQW5kIGlmIHRoaXMgaXMgb24gdGhlIG9wbG9nIGNvbGxlY3Rpb24gYW5kIHRoZSBjdXJzb3Igc3BlY2lmaWVzIGEgJ3RzJyxcbiAgICAvLyB0aGVuIHNldCB0aGUgdW5kb2N1bWVudGVkIG9wbG9nIHJlcGxheSBmbGFnLCB3aGljaCBkb2VzIGEgc3BlY2lhbCBzY2FuIHRvXG4gICAgLy8gZmluZCB0aGUgZmlyc3QgZG9jdW1lbnQgKGluc3RlYWQgb2YgY3JlYXRpbmcgYW4gaW5kZXggb24gdHMpLiBUaGlzIGlzIGFcbiAgICAvLyB2ZXJ5IGhhcmQtY29kZWQgTW9uZ28gZmxhZyB3aGljaCBvbmx5IHdvcmtzIG9uIHRoZSBvcGxvZyBjb2xsZWN0aW9uIGFuZFxuICAgIC8vIG9ubHkgd29ya3Mgd2l0aCB0aGUgdHMgZmllbGQuXG4gICAgaWYgKGN1cnNvckRlc2NyaXB0aW9uLmNvbGxlY3Rpb25OYW1lID09PSBPUExPR19DT0xMRUNUSU9OICYmXG4gICAgICAgIGN1cnNvckRlc2NyaXB0aW9uLnNlbGVjdG9yLnRzKSB7XG4gICAgICBkYkN1cnNvci5hZGRDdXJzb3JGbGFnKFwib3Bsb2dSZXBsYXlcIiwgdHJ1ZSlcbiAgICB9XG4gIH1cblxuICBpZiAodHlwZW9mIGN1cnNvck9wdGlvbnMubWF4VGltZU1zICE9PSAndW5kZWZpbmVkJykge1xuICAgIGRiQ3Vyc29yID0gZGJDdXJzb3IubWF4VGltZU1TKGN1cnNvck9wdGlvbnMubWF4VGltZU1zKTtcbiAgfVxuICBpZiAodHlwZW9mIGN1cnNvck9wdGlvbnMuaGludCAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICBkYkN1cnNvciA9IGRiQ3Vyc29yLmhpbnQoY3Vyc29yT3B0aW9ucy5oaW50KTtcbiAgfVxuXG4gIHJldHVybiBuZXcgU3luY2hyb25vdXNDdXJzb3IoZGJDdXJzb3IsIGN1cnNvckRlc2NyaXB0aW9uLCBvcHRpb25zLCBjb2xsZWN0aW9uKTtcbn07XG5cbnZhciBTeW5jaHJvbm91c0N1cnNvciA9IGZ1bmN0aW9uIChkYkN1cnNvciwgY3Vyc29yRGVzY3JpcHRpb24sIG9wdGlvbnMsIGNvbGxlY3Rpb24pIHtcbiAgdmFyIHNlbGYgPSB0aGlzO1xuICBvcHRpb25zID0gXy5waWNrKG9wdGlvbnMgfHwge30sICdzZWxmRm9ySXRlcmF0aW9uJywgJ3VzZVRyYW5zZm9ybScpO1xuXG4gIHNlbGYuX2RiQ3Vyc29yID0gZGJDdXJzb3I7XG4gIHNlbGYuX2N1cnNvckRlc2NyaXB0aW9uID0gY3Vyc29yRGVzY3JpcHRpb247XG4gIC8vIFRoZSBcInNlbGZcIiBhcmd1bWVudCBwYXNzZWQgdG8gZm9yRWFjaC9tYXAgY2FsbGJhY2tzLiBJZiB3ZSdyZSB3cmFwcGVkXG4gIC8vIGluc2lkZSBhIHVzZXItdmlzaWJsZSBDdXJzb3IsIHdlIHdhbnQgdG8gcHJvdmlkZSB0aGUgb3V0ZXIgY3Vyc29yIVxuICBzZWxmLl9zZWxmRm9ySXRlcmF0aW9uID0gb3B0aW9ucy5zZWxmRm9ySXRlcmF0aW9uIHx8IHNlbGY7XG4gIGlmIChvcHRpb25zLnVzZVRyYW5zZm9ybSAmJiBjdXJzb3JEZXNjcmlwdGlvbi5vcHRpb25zLnRyYW5zZm9ybSkge1xuICAgIHNlbGYuX3RyYW5zZm9ybSA9IExvY2FsQ29sbGVjdGlvbi53cmFwVHJhbnNmb3JtKFxuICAgICAgY3Vyc29yRGVzY3JpcHRpb24ub3B0aW9ucy50cmFuc2Zvcm0pO1xuICB9IGVsc2Uge1xuICAgIHNlbGYuX3RyYW5zZm9ybSA9IG51bGw7XG4gIH1cblxuICBzZWxmLl9zeW5jaHJvbm91c0NvdW50ID0gRnV0dXJlLndyYXAoXG4gICAgY29sbGVjdGlvbi5jb3VudERvY3VtZW50cy5iaW5kKFxuICAgICAgY29sbGVjdGlvbixcbiAgICAgIHJlcGxhY2VUeXBlcyhjdXJzb3JEZXNjcmlwdGlvbi5zZWxlY3RvciwgcmVwbGFjZU1ldGVvckF0b21XaXRoTW9uZ28pLFxuICAgICAgcmVwbGFjZVR5cGVzKGN1cnNvckRlc2NyaXB0aW9uLm9wdGlvbnMsIHJlcGxhY2VNZXRlb3JBdG9tV2l0aE1vbmdvKSxcbiAgICApXG4gICk7XG4gIHNlbGYuX3Zpc2l0ZWRJZHMgPSBuZXcgTG9jYWxDb2xsZWN0aW9uLl9JZE1hcDtcbn07XG5cbl8uZXh0ZW5kKFN5bmNocm9ub3VzQ3Vyc29yLnByb3RvdHlwZSwge1xuICAvLyBSZXR1cm5zIGEgUHJvbWlzZSBmb3IgdGhlIG5leHQgb2JqZWN0IGZyb20gdGhlIHVuZGVybHlpbmcgY3Vyc29yIChiZWZvcmVcbiAgLy8gdGhlIE1vbmdvLT5NZXRlb3IgdHlwZSByZXBsYWNlbWVudCkuXG4gIF9yYXdOZXh0T2JqZWN0UHJvbWlzZTogZnVuY3Rpb24gKCkge1xuICAgIGNvbnN0IHNlbGYgPSB0aGlzO1xuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICBzZWxmLl9kYkN1cnNvci5uZXh0KChlcnIsIGRvYykgPT4ge1xuICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgcmVqZWN0KGVycik7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmVzb2x2ZShkb2MpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfSxcblxuICAvLyBSZXR1cm5zIGEgUHJvbWlzZSBmb3IgdGhlIG5leHQgb2JqZWN0IGZyb20gdGhlIGN1cnNvciwgc2tpcHBpbmcgdGhvc2Ugd2hvc2VcbiAgLy8gSURzIHdlJ3ZlIGFscmVhZHkgc2VlbiBhbmQgcmVwbGFjaW5nIE1vbmdvIGF0b21zIHdpdGggTWV0ZW9yIGF0b21zLlxuICBfbmV4dE9iamVjdFByb21pc2U6IGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgICB3aGlsZSAodHJ1ZSkge1xuICAgICAgdmFyIGRvYyA9IGF3YWl0IHNlbGYuX3Jhd05leHRPYmplY3RQcm9taXNlKCk7XG5cbiAgICAgIGlmICghZG9jKSByZXR1cm4gbnVsbDtcbiAgICAgIGRvYyA9IHJlcGxhY2VUeXBlcyhkb2MsIHJlcGxhY2VNb25nb0F0b21XaXRoTWV0ZW9yKTtcblxuICAgICAgaWYgKCFzZWxmLl9jdXJzb3JEZXNjcmlwdGlvbi5vcHRpb25zLnRhaWxhYmxlICYmIF8uaGFzKGRvYywgJ19pZCcpKSB7XG4gICAgICAgIC8vIERpZCBNb25nbyBnaXZlIHVzIGR1cGxpY2F0ZSBkb2N1bWVudHMgaW4gdGhlIHNhbWUgY3Vyc29yPyBJZiBzbyxcbiAgICAgICAgLy8gaWdub3JlIHRoaXMgb25lLiAoRG8gdGhpcyBiZWZvcmUgdGhlIHRyYW5zZm9ybSwgc2luY2UgdHJhbnNmb3JtIG1pZ2h0XG4gICAgICAgIC8vIHJldHVybiBzb21lIHVucmVsYXRlZCB2YWx1ZS4pIFdlIGRvbid0IGRvIHRoaXMgZm9yIHRhaWxhYmxlIGN1cnNvcnMsXG4gICAgICAgIC8vIGJlY2F1c2Ugd2Ugd2FudCB0byBtYWludGFpbiBPKDEpIG1lbW9yeSB1c2FnZS4gQW5kIGlmIHRoZXJlIGlzbid0IF9pZFxuICAgICAgICAvLyBmb3Igc29tZSByZWFzb24gKG1heWJlIGl0J3MgdGhlIG9wbG9nKSwgdGhlbiB3ZSBkb24ndCBkbyB0aGlzIGVpdGhlci5cbiAgICAgICAgLy8gKEJlIGNhcmVmdWwgdG8gZG8gdGhpcyBmb3IgZmFsc2V5IGJ1dCBleGlzdGluZyBfaWQsIHRob3VnaC4pXG4gICAgICAgIGlmIChzZWxmLl92aXNpdGVkSWRzLmhhcyhkb2MuX2lkKSkgY29udGludWU7XG4gICAgICAgIHNlbGYuX3Zpc2l0ZWRJZHMuc2V0KGRvYy5faWQsIHRydWUpO1xuICAgICAgfVxuXG4gICAgICBpZiAoc2VsZi5fdHJhbnNmb3JtKVxuICAgICAgICBkb2MgPSBzZWxmLl90cmFuc2Zvcm0oZG9jKTtcblxuICAgICAgcmV0dXJuIGRvYztcbiAgICB9XG4gIH0sXG5cbiAgLy8gUmV0dXJucyBhIHByb21pc2Ugd2hpY2ggaXMgcmVzb2x2ZWQgd2l0aCB0aGUgbmV4dCBvYmplY3QgKGxpa2Ugd2l0aFxuICAvLyBfbmV4dE9iamVjdFByb21pc2UpIG9yIHJlamVjdGVkIGlmIHRoZSBjdXJzb3IgZG9lc24ndCByZXR1cm4gd2l0aGluXG4gIC8vIHRpbWVvdXRNUyBtcy5cbiAgX25leHRPYmplY3RQcm9taXNlV2l0aFRpbWVvdXQ6IGZ1bmN0aW9uICh0aW1lb3V0TVMpIHtcbiAgICBjb25zdCBzZWxmID0gdGhpcztcbiAgICBpZiAoIXRpbWVvdXRNUykge1xuICAgICAgcmV0dXJuIHNlbGYuX25leHRPYmplY3RQcm9taXNlKCk7XG4gICAgfVxuICAgIGNvbnN0IG5leHRPYmplY3RQcm9taXNlID0gc2VsZi5fbmV4dE9iamVjdFByb21pc2UoKTtcbiAgICBjb25zdCB0aW1lb3V0RXJyID0gbmV3IEVycm9yKCdDbGllbnQtc2lkZSB0aW1lb3V0IHdhaXRpbmcgZm9yIG5leHQgb2JqZWN0Jyk7XG4gICAgY29uc3QgdGltZW91dFByb21pc2UgPSBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICBjb25zdCB0aW1lciA9IHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICByZWplY3QodGltZW91dEVycik7XG4gICAgICB9LCB0aW1lb3V0TVMpO1xuICAgIH0pO1xuICAgIHJldHVybiBQcm9taXNlLnJhY2UoW25leHRPYmplY3RQcm9taXNlLCB0aW1lb3V0UHJvbWlzZV0pXG4gICAgICAuY2F0Y2goKGVycikgPT4ge1xuICAgICAgICBpZiAoZXJyID09PSB0aW1lb3V0RXJyKSB7XG4gICAgICAgICAgc2VsZi5jbG9zZSgpO1xuICAgICAgICB9XG4gICAgICAgIHRocm93IGVycjtcbiAgICAgIH0pO1xuICB9LFxuXG4gIF9uZXh0T2JqZWN0OiBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIHJldHVybiBzZWxmLl9uZXh0T2JqZWN0UHJvbWlzZSgpLmF3YWl0KCk7XG4gIH0sXG5cbiAgZm9yRWFjaDogZnVuY3Rpb24gKGNhbGxiYWNrLCB0aGlzQXJnKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIGNvbnN0IHdyYXBwZWRGbiA9IE1ldGVvci53cmFwRm4oY2FsbGJhY2spO1xuXG4gICAgLy8gR2V0IGJhY2sgdG8gdGhlIGJlZ2lubmluZy5cbiAgICBzZWxmLl9yZXdpbmQoKTtcblxuICAgIC8vIFdlIGltcGxlbWVudCB0aGUgbG9vcCBvdXJzZWxmIGluc3RlYWQgb2YgdXNpbmcgc2VsZi5fZGJDdXJzb3IuZWFjaCxcbiAgICAvLyBiZWNhdXNlIFwiZWFjaFwiIHdpbGwgY2FsbCBpdHMgY2FsbGJhY2sgb3V0c2lkZSBvZiBhIGZpYmVyIHdoaWNoIG1ha2VzIGl0XG4gICAgLy8gbXVjaCBtb3JlIGNvbXBsZXggdG8gbWFrZSB0aGlzIGZ1bmN0aW9uIHN5bmNocm9ub3VzLlxuICAgIHZhciBpbmRleCA9IDA7XG4gICAgd2hpbGUgKHRydWUpIHtcbiAgICAgIHZhciBkb2MgPSBzZWxmLl9uZXh0T2JqZWN0KCk7XG4gICAgICBpZiAoIWRvYykgcmV0dXJuO1xuICAgICAgd3JhcHBlZEZuLmNhbGwodGhpc0FyZywgZG9jLCBpbmRleCsrLCBzZWxmLl9zZWxmRm9ySXRlcmF0aW9uKTtcbiAgICB9XG4gIH0sXG5cbiAgLy8gWFhYIEFsbG93IG92ZXJsYXBwaW5nIGNhbGxiYWNrIGV4ZWN1dGlvbnMgaWYgY2FsbGJhY2sgeWllbGRzLlxuICBtYXA6IGZ1bmN0aW9uIChjYWxsYmFjaywgdGhpc0FyZykge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICBjb25zdCB3cmFwcGVkRm4gPSBNZXRlb3Iud3JhcEZuKGNhbGxiYWNrKTtcbiAgICB2YXIgcmVzID0gW107XG4gICAgc2VsZi5mb3JFYWNoKGZ1bmN0aW9uIChkb2MsIGluZGV4KSB7XG4gICAgICByZXMucHVzaCh3cmFwcGVkRm4uY2FsbCh0aGlzQXJnLCBkb2MsIGluZGV4LCBzZWxmLl9zZWxmRm9ySXRlcmF0aW9uKSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIHJlcztcbiAgfSxcblxuICBfcmV3aW5kOiBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gICAgLy8ga25vd24gdG8gYmUgc3luY2hyb25vdXNcbiAgICBzZWxmLl9kYkN1cnNvci5yZXdpbmQoKTtcblxuICAgIHNlbGYuX3Zpc2l0ZWRJZHMgPSBuZXcgTG9jYWxDb2xsZWN0aW9uLl9JZE1hcDtcbiAgfSxcblxuICAvLyBNb3N0bHkgdXNhYmxlIGZvciB0YWlsYWJsZSBjdXJzb3JzLlxuICBjbG9zZTogZnVuY3Rpb24gKCkge1xuICAgIHZhciBzZWxmID0gdGhpcztcblxuICAgIHNlbGYuX2RiQ3Vyc29yLmNsb3NlKCk7XG4gIH0sXG5cbiAgZmV0Y2g6IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgcmV0dXJuIHNlbGYubWFwKF8uaWRlbnRpdHkpO1xuICB9LFxuXG4gIGNvdW50OiBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIHJldHVybiBzZWxmLl9zeW5jaHJvbm91c0NvdW50KCkud2FpdCgpO1xuICB9LFxuXG4gIC8vIFRoaXMgbWV0aG9kIGlzIE5PVCB3cmFwcGVkIGluIEN1cnNvci5cbiAgZ2V0UmF3T2JqZWN0czogZnVuY3Rpb24gKG9yZGVyZWQpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgaWYgKG9yZGVyZWQpIHtcbiAgICAgIHJldHVybiBzZWxmLmZldGNoKCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciByZXN1bHRzID0gbmV3IExvY2FsQ29sbGVjdGlvbi5fSWRNYXA7XG4gICAgICBzZWxmLmZvckVhY2goZnVuY3Rpb24gKGRvYykge1xuICAgICAgICByZXN1bHRzLnNldChkb2MuX2lkLCBkb2MpO1xuICAgICAgfSk7XG4gICAgICByZXR1cm4gcmVzdWx0cztcbiAgICB9XG4gIH1cbn0pO1xuXG5TeW5jaHJvbm91c0N1cnNvci5wcm90b3R5cGVbU3ltYm9sLml0ZXJhdG9yXSA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gIC8vIEdldCBiYWNrIHRvIHRoZSBiZWdpbm5pbmcuXG4gIHNlbGYuX3Jld2luZCgpO1xuXG4gIHJldHVybiB7XG4gICAgbmV4dCgpIHtcbiAgICAgIGNvbnN0IGRvYyA9IHNlbGYuX25leHRPYmplY3QoKTtcbiAgICAgIHJldHVybiBkb2MgPyB7XG4gICAgICAgIHZhbHVlOiBkb2NcbiAgICAgIH0gOiB7XG4gICAgICAgIGRvbmU6IHRydWVcbiAgICAgIH07XG4gICAgfVxuICB9O1xufTtcblxuU3luY2hyb25vdXNDdXJzb3IucHJvdG90eXBlW1N5bWJvbC5hc3luY0l0ZXJhdG9yXSA9IGZ1bmN0aW9uICgpIHtcbiAgY29uc3Qgc3luY1Jlc3VsdCA9IHRoaXNbU3ltYm9sLml0ZXJhdG9yXSgpO1xuICByZXR1cm4ge1xuICAgIGFzeW5jIG5leHQoKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHN5bmNSZXN1bHQubmV4dCgpKTtcbiAgICB9XG4gIH07XG59XG5cbi8vIFRhaWxzIHRoZSBjdXJzb3IgZGVzY3JpYmVkIGJ5IGN1cnNvckRlc2NyaXB0aW9uLCBtb3N0IGxpa2VseSBvbiB0aGVcbi8vIG9wbG9nLiBDYWxscyBkb2NDYWxsYmFjayB3aXRoIGVhY2ggZG9jdW1lbnQgZm91bmQuIElnbm9yZXMgZXJyb3JzIGFuZCBqdXN0XG4vLyByZXN0YXJ0cyB0aGUgdGFpbCBvbiBlcnJvci5cbi8vXG4vLyBJZiB0aW1lb3V0TVMgaXMgc2V0LCB0aGVuIGlmIHdlIGRvbid0IGdldCBhIG5ldyBkb2N1bWVudCBldmVyeSB0aW1lb3V0TVMsXG4vLyBraWxsIGFuZCByZXN0YXJ0IHRoZSBjdXJzb3IuIFRoaXMgaXMgcHJpbWFyaWx5IGEgd29ya2Fyb3VuZCBmb3IgIzg1OTguXG5Nb25nb0Nvbm5lY3Rpb24ucHJvdG90eXBlLnRhaWwgPSBmdW5jdGlvbiAoY3Vyc29yRGVzY3JpcHRpb24sIGRvY0NhbGxiYWNrLCB0aW1lb3V0TVMpIHtcbiAgdmFyIHNlbGYgPSB0aGlzO1xuICBpZiAoIWN1cnNvckRlc2NyaXB0aW9uLm9wdGlvbnMudGFpbGFibGUpXG4gICAgdGhyb3cgbmV3IEVycm9yKFwiQ2FuIG9ubHkgdGFpbCBhIHRhaWxhYmxlIGN1cnNvclwiKTtcblxuICB2YXIgY3Vyc29yID0gc2VsZi5fY3JlYXRlU3luY2hyb25vdXNDdXJzb3IoY3Vyc29yRGVzY3JpcHRpb24pO1xuXG4gIHZhciBzdG9wcGVkID0gZmFsc2U7XG4gIHZhciBsYXN0VFM7XG4gIHZhciBsb29wID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciBkb2MgPSBudWxsO1xuICAgIHdoaWxlICh0cnVlKSB7XG4gICAgICBpZiAoc3RvcHBlZClcbiAgICAgICAgcmV0dXJuO1xuICAgICAgdHJ5IHtcbiAgICAgICAgZG9jID0gY3Vyc29yLl9uZXh0T2JqZWN0UHJvbWlzZVdpdGhUaW1lb3V0KHRpbWVvdXRNUykuYXdhaXQoKTtcbiAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAvLyBUaGVyZSdzIG5vIGdvb2Qgd2F5IHRvIGZpZ3VyZSBvdXQgaWYgdGhpcyB3YXMgYWN0dWFsbHkgYW4gZXJyb3IgZnJvbVxuICAgICAgICAvLyBNb25nbywgb3IganVzdCBjbGllbnQtc2lkZSAoaW5jbHVkaW5nIG91ciBvd24gdGltZW91dCBlcnJvcikuIEFoXG4gICAgICAgIC8vIHdlbGwuIEJ1dCBlaXRoZXIgd2F5LCB3ZSBuZWVkIHRvIHJldHJ5IHRoZSBjdXJzb3IgKHVubGVzcyB0aGUgZmFpbHVyZVxuICAgICAgICAvLyB3YXMgYmVjYXVzZSB0aGUgb2JzZXJ2ZSBnb3Qgc3RvcHBlZCkuXG4gICAgICAgIGRvYyA9IG51bGw7XG4gICAgICB9XG4gICAgICAvLyBTaW5jZSB3ZSBhd2FpdGVkIGEgcHJvbWlzZSBhYm92ZSwgd2UgbmVlZCB0byBjaGVjayBhZ2FpbiB0byBzZWUgaWZcbiAgICAgIC8vIHdlJ3ZlIGJlZW4gc3RvcHBlZCBiZWZvcmUgY2FsbGluZyB0aGUgY2FsbGJhY2suXG4gICAgICBpZiAoc3RvcHBlZClcbiAgICAgICAgcmV0dXJuO1xuICAgICAgaWYgKGRvYykge1xuICAgICAgICAvLyBJZiBhIHRhaWxhYmxlIGN1cnNvciBjb250YWlucyBhIFwidHNcIiBmaWVsZCwgdXNlIGl0IHRvIHJlY3JlYXRlIHRoZVxuICAgICAgICAvLyBjdXJzb3Igb24gZXJyb3IuIChcInRzXCIgaXMgYSBzdGFuZGFyZCB0aGF0IE1vbmdvIHVzZXMgaW50ZXJuYWxseSBmb3JcbiAgICAgICAgLy8gdGhlIG9wbG9nLCBhbmQgdGhlcmUncyBhIHNwZWNpYWwgZmxhZyB0aGF0IGxldHMgeW91IGRvIGJpbmFyeSBzZWFyY2hcbiAgICAgICAgLy8gb24gaXQgaW5zdGVhZCBvZiBuZWVkaW5nIHRvIHVzZSBhbiBpbmRleC4pXG4gICAgICAgIGxhc3RUUyA9IGRvYy50cztcbiAgICAgICAgZG9jQ2FsbGJhY2soZG9jKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciBuZXdTZWxlY3RvciA9IF8uY2xvbmUoY3Vyc29yRGVzY3JpcHRpb24uc2VsZWN0b3IpO1xuICAgICAgICBpZiAobGFzdFRTKSB7XG4gICAgICAgICAgbmV3U2VsZWN0b3IudHMgPSB7JGd0OiBsYXN0VFN9O1xuICAgICAgICB9XG4gICAgICAgIGN1cnNvciA9IHNlbGYuX2NyZWF0ZVN5bmNocm9ub3VzQ3Vyc29yKG5ldyBDdXJzb3JEZXNjcmlwdGlvbihcbiAgICAgICAgICBjdXJzb3JEZXNjcmlwdGlvbi5jb2xsZWN0aW9uTmFtZSxcbiAgICAgICAgICBuZXdTZWxlY3RvcixcbiAgICAgICAgICBjdXJzb3JEZXNjcmlwdGlvbi5vcHRpb25zKSk7XG4gICAgICAgIC8vIE1vbmdvIGZhaWxvdmVyIHRha2VzIG1hbnkgc2Vjb25kcy4gIFJldHJ5IGluIGEgYml0LiAgKFdpdGhvdXQgdGhpc1xuICAgICAgICAvLyBzZXRUaW1lb3V0LCB3ZSBwZWcgdGhlIENQVSBhdCAxMDAlIGFuZCBuZXZlciBub3RpY2UgdGhlIGFjdHVhbFxuICAgICAgICAvLyBmYWlsb3Zlci5cbiAgICAgICAgTWV0ZW9yLnNldFRpbWVvdXQobG9vcCwgMTAwKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuICB9O1xuXG4gIE1ldGVvci5kZWZlcihsb29wKTtcblxuICByZXR1cm4ge1xuICAgIHN0b3A6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHN0b3BwZWQgPSB0cnVlO1xuICAgICAgY3Vyc29yLmNsb3NlKCk7XG4gICAgfVxuICB9O1xufTtcblxuTW9uZ29Db25uZWN0aW9uLnByb3RvdHlwZS5fb2JzZXJ2ZUNoYW5nZXMgPSBmdW5jdGlvbiAoXG4gICAgY3Vyc29yRGVzY3JpcHRpb24sIG9yZGVyZWQsIGNhbGxiYWNrcywgbm9uTXV0YXRpbmdDYWxsYmFja3MpIHtcbiAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gIGlmIChjdXJzb3JEZXNjcmlwdGlvbi5vcHRpb25zLnRhaWxhYmxlKSB7XG4gICAgcmV0dXJuIHNlbGYuX29ic2VydmVDaGFuZ2VzVGFpbGFibGUoY3Vyc29yRGVzY3JpcHRpb24sIG9yZGVyZWQsIGNhbGxiYWNrcyk7XG4gIH1cblxuICAvLyBZb3UgbWF5IG5vdCBmaWx0ZXIgb3V0IF9pZCB3aGVuIG9ic2VydmluZyBjaGFuZ2VzLCBiZWNhdXNlIHRoZSBpZCBpcyBhIGNvcmVcbiAgLy8gcGFydCBvZiB0aGUgb2JzZXJ2ZUNoYW5nZXMgQVBJLlxuICBjb25zdCBmaWVsZHNPcHRpb25zID0gY3Vyc29yRGVzY3JpcHRpb24ub3B0aW9ucy5wcm9qZWN0aW9uIHx8IGN1cnNvckRlc2NyaXB0aW9uLm9wdGlvbnMuZmllbGRzO1xuICBpZiAoZmllbGRzT3B0aW9ucyAmJlxuICAgICAgKGZpZWxkc09wdGlvbnMuX2lkID09PSAwIHx8XG4gICAgICAgZmllbGRzT3B0aW9ucy5faWQgPT09IGZhbHNlKSkge1xuICAgIHRocm93IEVycm9yKFwiWW91IG1heSBub3Qgb2JzZXJ2ZSBhIGN1cnNvciB3aXRoIHtmaWVsZHM6IHtfaWQ6IDB9fVwiKTtcbiAgfVxuXG4gIHZhciBvYnNlcnZlS2V5ID0gRUpTT04uc3RyaW5naWZ5KFxuICAgIF8uZXh0ZW5kKHtvcmRlcmVkOiBvcmRlcmVkfSwgY3Vyc29yRGVzY3JpcHRpb24pKTtcblxuICB2YXIgbXVsdGlwbGV4ZXIsIG9ic2VydmVEcml2ZXI7XG4gIHZhciBmaXJzdEhhbmRsZSA9IGZhbHNlO1xuXG4gIC8vIEZpbmQgYSBtYXRjaGluZyBPYnNlcnZlTXVsdGlwbGV4ZXIsIG9yIGNyZWF0ZSBhIG5ldyBvbmUuIFRoaXMgbmV4dCBibG9jayBpc1xuICAvLyBndWFyYW50ZWVkIHRvIG5vdCB5aWVsZCAoYW5kIGl0IGRvZXNuJ3QgY2FsbCBhbnl0aGluZyB0aGF0IGNhbiBvYnNlcnZlIGFcbiAgLy8gbmV3IHF1ZXJ5KSwgc28gbm8gb3RoZXIgY2FsbHMgdG8gdGhpcyBmdW5jdGlvbiBjYW4gaW50ZXJsZWF2ZSB3aXRoIGl0LlxuICBNZXRlb3IuX25vWWllbGRzQWxsb3dlZChmdW5jdGlvbiAoKSB7XG4gICAgaWYgKF8uaGFzKHNlbGYuX29ic2VydmVNdWx0aXBsZXhlcnMsIG9ic2VydmVLZXkpKSB7XG4gICAgICBtdWx0aXBsZXhlciA9IHNlbGYuX29ic2VydmVNdWx0aXBsZXhlcnNbb2JzZXJ2ZUtleV07XG4gICAgfSBlbHNlIHtcbiAgICAgIGZpcnN0SGFuZGxlID0gdHJ1ZTtcbiAgICAgIC8vIENyZWF0ZSBhIG5ldyBPYnNlcnZlTXVsdGlwbGV4ZXIuXG4gICAgICBtdWx0aXBsZXhlciA9IG5ldyBPYnNlcnZlTXVsdGlwbGV4ZXIoe1xuICAgICAgICBvcmRlcmVkOiBvcmRlcmVkLFxuICAgICAgICBvblN0b3A6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkZWxldGUgc2VsZi5fb2JzZXJ2ZU11bHRpcGxleGVyc1tvYnNlcnZlS2V5XTtcbiAgICAgICAgICBvYnNlcnZlRHJpdmVyLnN0b3AoKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICBzZWxmLl9vYnNlcnZlTXVsdGlwbGV4ZXJzW29ic2VydmVLZXldID0gbXVsdGlwbGV4ZXI7XG4gICAgfVxuICB9KTtcblxuICB2YXIgb2JzZXJ2ZUhhbmRsZSA9IG5ldyBPYnNlcnZlSGFuZGxlKG11bHRpcGxleGVyLFxuICAgIGNhbGxiYWNrcyxcbiAgICBub25NdXRhdGluZ0NhbGxiYWNrcyxcbiAgKTtcblxuICBpZiAoZmlyc3RIYW5kbGUpIHtcbiAgICB2YXIgbWF0Y2hlciwgc29ydGVyO1xuICAgIHZhciBjYW5Vc2VPcGxvZyA9IF8uYWxsKFtcbiAgICAgIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgLy8gQXQgYSBiYXJlIG1pbmltdW0sIHVzaW5nIHRoZSBvcGxvZyByZXF1aXJlcyB1cyB0byBoYXZlIGFuIG9wbG9nLCB0b1xuICAgICAgICAvLyB3YW50IHVub3JkZXJlZCBjYWxsYmFja3MsIGFuZCB0byBub3Qgd2FudCBhIGNhbGxiYWNrIG9uIHRoZSBwb2xsc1xuICAgICAgICAvLyB0aGF0IHdvbid0IGhhcHBlbi5cbiAgICAgICAgcmV0dXJuIHNlbGYuX29wbG9nSGFuZGxlICYmICFvcmRlcmVkICYmXG4gICAgICAgICAgIWNhbGxiYWNrcy5fdGVzdE9ubHlQb2xsQ2FsbGJhY2s7XG4gICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgIC8vIFdlIG5lZWQgdG8gYmUgYWJsZSB0byBjb21waWxlIHRoZSBzZWxlY3Rvci4gRmFsbCBiYWNrIHRvIHBvbGxpbmcgZm9yXG4gICAgICAgIC8vIHNvbWUgbmV3ZmFuZ2xlZCAkc2VsZWN0b3IgdGhhdCBtaW5pbW9uZ28gZG9lc24ndCBzdXBwb3J0IHlldC5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBtYXRjaGVyID0gbmV3IE1pbmltb25nby5NYXRjaGVyKGN1cnNvckRlc2NyaXB0aW9uLnNlbGVjdG9yKTtcbiAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIC8vIFhYWCBtYWtlIGFsbCBjb21waWxhdGlvbiBlcnJvcnMgTWluaW1vbmdvRXJyb3Igb3Igc29tZXRoaW5nXG4gICAgICAgICAgLy8gICAgIHNvIHRoYXQgdGhpcyBkb2Vzbid0IGlnbm9yZSB1bnJlbGF0ZWQgZXhjZXB0aW9uc1xuICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAvLyAuLi4gYW5kIHRoZSBzZWxlY3RvciBpdHNlbGYgbmVlZHMgdG8gc3VwcG9ydCBvcGxvZy5cbiAgICAgICAgcmV0dXJuIE9wbG9nT2JzZXJ2ZURyaXZlci5jdXJzb3JTdXBwb3J0ZWQoY3Vyc29yRGVzY3JpcHRpb24sIG1hdGNoZXIpO1xuICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAvLyBBbmQgd2UgbmVlZCB0byBiZSBhYmxlIHRvIGNvbXBpbGUgdGhlIHNvcnQsIGlmIGFueS4gIGVnLCBjYW4ndCBiZVxuICAgICAgICAvLyB7JG5hdHVyYWw6IDF9LlxuICAgICAgICBpZiAoIWN1cnNvckRlc2NyaXB0aW9uLm9wdGlvbnMuc29ydClcbiAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBzb3J0ZXIgPSBuZXcgTWluaW1vbmdvLlNvcnRlcihjdXJzb3JEZXNjcmlwdGlvbi5vcHRpb25zLnNvcnQpO1xuICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgLy8gWFhYIG1ha2UgYWxsIGNvbXBpbGF0aW9uIGVycm9ycyBNaW5pbW9uZ29FcnJvciBvciBzb21ldGhpbmdcbiAgICAgICAgICAvLyAgICAgc28gdGhhdCB0aGlzIGRvZXNuJ3QgaWdub3JlIHVucmVsYXRlZCBleGNlcHRpb25zXG4gICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICB9XSwgZnVuY3Rpb24gKGYpIHsgcmV0dXJuIGYoKTsgfSk7ICAvLyBpbnZva2UgZWFjaCBmdW5jdGlvblxuXG4gICAgdmFyIGRyaXZlckNsYXNzID0gY2FuVXNlT3Bsb2cgPyBPcGxvZ09ic2VydmVEcml2ZXIgOiBQb2xsaW5nT2JzZXJ2ZURyaXZlcjtcbiAgICBvYnNlcnZlRHJpdmVyID0gbmV3IGRyaXZlckNsYXNzKHtcbiAgICAgIGN1cnNvckRlc2NyaXB0aW9uOiBjdXJzb3JEZXNjcmlwdGlvbixcbiAgICAgIG1vbmdvSGFuZGxlOiBzZWxmLFxuICAgICAgbXVsdGlwbGV4ZXI6IG11bHRpcGxleGVyLFxuICAgICAgb3JkZXJlZDogb3JkZXJlZCxcbiAgICAgIG1hdGNoZXI6IG1hdGNoZXIsICAvLyBpZ25vcmVkIGJ5IHBvbGxpbmdcbiAgICAgIHNvcnRlcjogc29ydGVyLCAgLy8gaWdub3JlZCBieSBwb2xsaW5nXG4gICAgICBfdGVzdE9ubHlQb2xsQ2FsbGJhY2s6IGNhbGxiYWNrcy5fdGVzdE9ubHlQb2xsQ2FsbGJhY2tcbiAgICB9KTtcblxuICAgIC8vIFRoaXMgZmllbGQgaXMgb25seSBzZXQgZm9yIHVzZSBpbiB0ZXN0cy5cbiAgICBtdWx0aXBsZXhlci5fb2JzZXJ2ZURyaXZlciA9IG9ic2VydmVEcml2ZXI7XG4gIH1cblxuICAvLyBCbG9ja3MgdW50aWwgdGhlIGluaXRpYWwgYWRkcyBoYXZlIGJlZW4gc2VudC5cbiAgbXVsdGlwbGV4ZXIuYWRkSGFuZGxlQW5kU2VuZEluaXRpYWxBZGRzKG9ic2VydmVIYW5kbGUpO1xuXG4gIHJldHVybiBvYnNlcnZlSGFuZGxlO1xufTtcblxuLy8gTGlzdGVuIGZvciB0aGUgaW52YWxpZGF0aW9uIG1lc3NhZ2VzIHRoYXQgd2lsbCB0cmlnZ2VyIHVzIHRvIHBvbGwgdGhlXG4vLyBkYXRhYmFzZSBmb3IgY2hhbmdlcy4gSWYgdGhpcyBzZWxlY3RvciBzcGVjaWZpZXMgc3BlY2lmaWMgSURzLCBzcGVjaWZ5IHRoZW1cbi8vIGhlcmUsIHNvIHRoYXQgdXBkYXRlcyB0byBkaWZmZXJlbnQgc3BlY2lmaWMgSURzIGRvbid0IGNhdXNlIHVzIHRvIHBvbGwuXG4vLyBsaXN0ZW5DYWxsYmFjayBpcyB0aGUgc2FtZSBraW5kIG9mIChub3RpZmljYXRpb24sIGNvbXBsZXRlKSBjYWxsYmFjayBwYXNzZWRcbi8vIHRvIEludmFsaWRhdGlvbkNyb3NzYmFyLmxpc3Rlbi5cblxubGlzdGVuQWxsID0gZnVuY3Rpb24gKGN1cnNvckRlc2NyaXB0aW9uLCBsaXN0ZW5DYWxsYmFjaykge1xuICB2YXIgbGlzdGVuZXJzID0gW107XG4gIGZvckVhY2hUcmlnZ2VyKGN1cnNvckRlc2NyaXB0aW9uLCBmdW5jdGlvbiAodHJpZ2dlcikge1xuICAgIGxpc3RlbmVycy5wdXNoKEREUFNlcnZlci5fSW52YWxpZGF0aW9uQ3Jvc3NiYXIubGlzdGVuKFxuICAgICAgdHJpZ2dlciwgbGlzdGVuQ2FsbGJhY2spKTtcbiAgfSk7XG5cbiAgcmV0dXJuIHtcbiAgICBzdG9wOiBmdW5jdGlvbiAoKSB7XG4gICAgICBfLmVhY2gobGlzdGVuZXJzLCBmdW5jdGlvbiAobGlzdGVuZXIpIHtcbiAgICAgICAgbGlzdGVuZXIuc3RvcCgpO1xuICAgICAgfSk7XG4gICAgfVxuICB9O1xufTtcblxuZm9yRWFjaFRyaWdnZXIgPSBmdW5jdGlvbiAoY3Vyc29yRGVzY3JpcHRpb24sIHRyaWdnZXJDYWxsYmFjaykge1xuICB2YXIga2V5ID0ge2NvbGxlY3Rpb246IGN1cnNvckRlc2NyaXB0aW9uLmNvbGxlY3Rpb25OYW1lfTtcbiAgdmFyIHNwZWNpZmljSWRzID0gTG9jYWxDb2xsZWN0aW9uLl9pZHNNYXRjaGVkQnlTZWxlY3RvcihcbiAgICBjdXJzb3JEZXNjcmlwdGlvbi5zZWxlY3Rvcik7XG4gIGlmIChzcGVjaWZpY0lkcykge1xuICAgIF8uZWFjaChzcGVjaWZpY0lkcywgZnVuY3Rpb24gKGlkKSB7XG4gICAgICB0cmlnZ2VyQ2FsbGJhY2soXy5leHRlbmQoe2lkOiBpZH0sIGtleSkpO1xuICAgIH0pO1xuICAgIHRyaWdnZXJDYWxsYmFjayhfLmV4dGVuZCh7ZHJvcENvbGxlY3Rpb246IHRydWUsIGlkOiBudWxsfSwga2V5KSk7XG4gIH0gZWxzZSB7XG4gICAgdHJpZ2dlckNhbGxiYWNrKGtleSk7XG4gIH1cbiAgLy8gRXZlcnlvbmUgY2FyZXMgYWJvdXQgdGhlIGRhdGFiYXNlIGJlaW5nIGRyb3BwZWQuXG4gIHRyaWdnZXJDYWxsYmFjayh7IGRyb3BEYXRhYmFzZTogdHJ1ZSB9KTtcbn07XG5cbi8vIG9ic2VydmVDaGFuZ2VzIGZvciB0YWlsYWJsZSBjdXJzb3JzIG9uIGNhcHBlZCBjb2xsZWN0aW9ucy5cbi8vXG4vLyBTb21lIGRpZmZlcmVuY2VzIGZyb20gbm9ybWFsIGN1cnNvcnM6XG4vLyAgIC0gV2lsbCBuZXZlciBwcm9kdWNlIGFueXRoaW5nIG90aGVyIHRoYW4gJ2FkZGVkJyBvciAnYWRkZWRCZWZvcmUnLiBJZiB5b3Vcbi8vICAgICBkbyB1cGRhdGUgYSBkb2N1bWVudCB0aGF0IGhhcyBhbHJlYWR5IGJlZW4gcHJvZHVjZWQsIHRoaXMgd2lsbCBub3Qgbm90aWNlXG4vLyAgICAgaXQuXG4vLyAgIC0gSWYgeW91IGRpc2Nvbm5lY3QgYW5kIHJlY29ubmVjdCBmcm9tIE1vbmdvLCBpdCB3aWxsIGVzc2VudGlhbGx5IHJlc3RhcnRcbi8vICAgICB0aGUgcXVlcnksIHdoaWNoIHdpbGwgbGVhZCB0byBkdXBsaWNhdGUgcmVzdWx0cy4gVGhpcyBpcyBwcmV0dHkgYmFkLFxuLy8gICAgIGJ1dCBpZiB5b3UgaW5jbHVkZSBhIGZpZWxkIGNhbGxlZCAndHMnIHdoaWNoIGlzIGluc2VydGVkIGFzXG4vLyAgICAgbmV3IE1vbmdvSW50ZXJuYWxzLk1vbmdvVGltZXN0YW1wKDAsIDApICh3aGljaCBpcyBpbml0aWFsaXplZCB0byB0aGVcbi8vICAgICBjdXJyZW50IE1vbmdvLXN0eWxlIHRpbWVzdGFtcCksIHdlJ2xsIGJlIGFibGUgdG8gZmluZCB0aGUgcGxhY2UgdG9cbi8vICAgICByZXN0YXJ0IHByb3Blcmx5LiAoVGhpcyBmaWVsZCBpcyBzcGVjaWZpY2FsbHkgdW5kZXJzdG9vZCBieSBNb25nbyB3aXRoIGFuXG4vLyAgICAgb3B0aW1pemF0aW9uIHdoaWNoIGFsbG93cyBpdCB0byBmaW5kIHRoZSByaWdodCBwbGFjZSB0byBzdGFydCB3aXRob3V0XG4vLyAgICAgYW4gaW5kZXggb24gdHMuIEl0J3MgaG93IHRoZSBvcGxvZyB3b3Jrcy4pXG4vLyAgIC0gTm8gY2FsbGJhY2tzIGFyZSB0cmlnZ2VyZWQgc3luY2hyb25vdXNseSB3aXRoIHRoZSBjYWxsICh0aGVyZSdzIG5vXG4vLyAgICAgZGlmZmVyZW50aWF0aW9uIGJldHdlZW4gXCJpbml0aWFsIGRhdGFcIiBhbmQgXCJsYXRlciBjaGFuZ2VzXCI7IGV2ZXJ5dGhpbmdcbi8vICAgICB0aGF0IG1hdGNoZXMgdGhlIHF1ZXJ5IGdldHMgc2VudCBhc3luY2hyb25vdXNseSkuXG4vLyAgIC0gRGUtZHVwbGljYXRpb24gaXMgbm90IGltcGxlbWVudGVkLlxuLy8gICAtIERvZXMgbm90IHlldCBpbnRlcmFjdCB3aXRoIHRoZSB3cml0ZSBmZW5jZS4gUHJvYmFibHksIHRoaXMgc2hvdWxkIHdvcmsgYnlcbi8vICAgICBpZ25vcmluZyByZW1vdmVzICh3aGljaCBkb24ndCB3b3JrIG9uIGNhcHBlZCBjb2xsZWN0aW9ucykgYW5kIHVwZGF0ZXNcbi8vICAgICAod2hpY2ggZG9uJ3QgYWZmZWN0IHRhaWxhYmxlIGN1cnNvcnMpLCBhbmQganVzdCBrZWVwaW5nIHRyYWNrIG9mIHRoZSBJRFxuLy8gICAgIG9mIHRoZSBpbnNlcnRlZCBvYmplY3QsIGFuZCBjbG9zaW5nIHRoZSB3cml0ZSBmZW5jZSBvbmNlIHlvdSBnZXQgdG8gdGhhdFxuLy8gICAgIElEIChvciB0aW1lc3RhbXA/KS4gIFRoaXMgZG9lc24ndCB3b3JrIHdlbGwgaWYgdGhlIGRvY3VtZW50IGRvZXNuJ3QgbWF0Y2hcbi8vICAgICB0aGUgcXVlcnksIHRob3VnaC4gIE9uIHRoZSBvdGhlciBoYW5kLCB0aGUgd3JpdGUgZmVuY2UgY2FuIGNsb3NlXG4vLyAgICAgaW1tZWRpYXRlbHkgaWYgaXQgZG9lcyBub3QgbWF0Y2ggdGhlIHF1ZXJ5LiBTbyBpZiB3ZSB0cnVzdCBtaW5pbW9uZ29cbi8vICAgICBlbm91Z2ggdG8gYWNjdXJhdGVseSBldmFsdWF0ZSB0aGUgcXVlcnkgYWdhaW5zdCB0aGUgd3JpdGUgZmVuY2UsIHdlXG4vLyAgICAgc2hvdWxkIGJlIGFibGUgdG8gZG8gdGhpcy4uLiAgT2YgY291cnNlLCBtaW5pbW9uZ28gZG9lc24ndCBldmVuIHN1cHBvcnRcbi8vICAgICBNb25nbyBUaW1lc3RhbXBzIHlldC5cbk1vbmdvQ29ubmVjdGlvbi5wcm90b3R5cGUuX29ic2VydmVDaGFuZ2VzVGFpbGFibGUgPSBmdW5jdGlvbiAoXG4gICAgY3Vyc29yRGVzY3JpcHRpb24sIG9yZGVyZWQsIGNhbGxiYWNrcykge1xuICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgLy8gVGFpbGFibGUgY3Vyc29ycyBvbmx5IGV2ZXIgY2FsbCBhZGRlZC9hZGRlZEJlZm9yZSBjYWxsYmFja3MsIHNvIGl0J3MgYW5cbiAgLy8gZXJyb3IgaWYgeW91IGRpZG4ndCBwcm92aWRlIHRoZW0uXG4gIGlmICgob3JkZXJlZCAmJiAhY2FsbGJhY2tzLmFkZGVkQmVmb3JlKSB8fFxuICAgICAgKCFvcmRlcmVkICYmICFjYWxsYmFja3MuYWRkZWQpKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwiQ2FuJ3Qgb2JzZXJ2ZSBhbiBcIiArIChvcmRlcmVkID8gXCJvcmRlcmVkXCIgOiBcInVub3JkZXJlZFwiKVxuICAgICAgICAgICAgICAgICAgICArIFwiIHRhaWxhYmxlIGN1cnNvciB3aXRob3V0IGEgXCJcbiAgICAgICAgICAgICAgICAgICAgKyAob3JkZXJlZCA/IFwiYWRkZWRCZWZvcmVcIiA6IFwiYWRkZWRcIikgKyBcIiBjYWxsYmFja1wiKTtcbiAgfVxuXG4gIHJldHVybiBzZWxmLnRhaWwoY3Vyc29yRGVzY3JpcHRpb24sIGZ1bmN0aW9uIChkb2MpIHtcbiAgICB2YXIgaWQgPSBkb2MuX2lkO1xuICAgIGRlbGV0ZSBkb2MuX2lkO1xuICAgIC8vIFRoZSB0cyBpcyBhbiBpbXBsZW1lbnRhdGlvbiBkZXRhaWwuIEhpZGUgaXQuXG4gICAgZGVsZXRlIGRvYy50cztcbiAgICBpZiAob3JkZXJlZCkge1xuICAgICAgY2FsbGJhY2tzLmFkZGVkQmVmb3JlKGlkLCBkb2MsIG51bGwpO1xuICAgIH0gZWxzZSB7XG4gICAgICBjYWxsYmFja3MuYWRkZWQoaWQsIGRvYyk7XG4gICAgfVxuICB9KTtcbn07XG5cbi8vIFhYWCBXZSBwcm9iYWJseSBuZWVkIHRvIGZpbmQgYSBiZXR0ZXIgd2F5IHRvIGV4cG9zZSB0aGlzLiBSaWdodCBub3dcbi8vIGl0J3Mgb25seSB1c2VkIGJ5IHRlc3RzLCBidXQgaW4gZmFjdCB5b3UgbmVlZCBpdCBpbiBub3JtYWxcbi8vIG9wZXJhdGlvbiB0byBpbnRlcmFjdCB3aXRoIGNhcHBlZCBjb2xsZWN0aW9ucy5cbk1vbmdvSW50ZXJuYWxzLk1vbmdvVGltZXN0YW1wID0gTW9uZ29EQi5UaW1lc3RhbXA7XG5cbk1vbmdvSW50ZXJuYWxzLkNvbm5lY3Rpb24gPSBNb25nb0Nvbm5lY3Rpb247XG4iLCJ2YXIgRnV0dXJlID0gTnBtLnJlcXVpcmUoJ2ZpYmVycy9mdXR1cmUnKTtcblxuaW1wb3J0IHsgTnBtTW9kdWxlTW9uZ29kYiB9IGZyb20gXCJtZXRlb3IvbnBtLW1vbmdvXCI7XG5jb25zdCB7IExvbmcgfSA9IE5wbU1vZHVsZU1vbmdvZGI7XG5cbk9QTE9HX0NPTExFQ1RJT04gPSAnb3Bsb2cucnMnO1xuXG52YXIgVE9PX0ZBUl9CRUhJTkQgPSBwcm9jZXNzLmVudi5NRVRFT1JfT1BMT0dfVE9PX0ZBUl9CRUhJTkQgfHwgMjAwMDtcbnZhciBUQUlMX1RJTUVPVVQgPSArcHJvY2Vzcy5lbnYuTUVURU9SX09QTE9HX1RBSUxfVElNRU9VVCB8fCAzMDAwMDtcblxudmFyIHNob3dUUyA9IGZ1bmN0aW9uICh0cykge1xuICByZXR1cm4gXCJUaW1lc3RhbXAoXCIgKyB0cy5nZXRIaWdoQml0cygpICsgXCIsIFwiICsgdHMuZ2V0TG93Qml0cygpICsgXCIpXCI7XG59O1xuXG5pZEZvck9wID0gZnVuY3Rpb24gKG9wKSB7XG4gIGlmIChvcC5vcCA9PT0gJ2QnKVxuICAgIHJldHVybiBvcC5vLl9pZDtcbiAgZWxzZSBpZiAob3Aub3AgPT09ICdpJylcbiAgICByZXR1cm4gb3Auby5faWQ7XG4gIGVsc2UgaWYgKG9wLm9wID09PSAndScpXG4gICAgcmV0dXJuIG9wLm8yLl9pZDtcbiAgZWxzZSBpZiAob3Aub3AgPT09ICdjJylcbiAgICB0aHJvdyBFcnJvcihcIk9wZXJhdG9yICdjJyBkb2Vzbid0IHN1cHBseSBhbiBvYmplY3Qgd2l0aCBpZDogXCIgK1xuICAgICAgICAgICAgICAgIEVKU09OLnN0cmluZ2lmeShvcCkpO1xuICBlbHNlXG4gICAgdGhyb3cgRXJyb3IoXCJVbmtub3duIG9wOiBcIiArIEVKU09OLnN0cmluZ2lmeShvcCkpO1xufTtcblxuT3Bsb2dIYW5kbGUgPSBmdW5jdGlvbiAob3Bsb2dVcmwsIGRiTmFtZSkge1xuICB2YXIgc2VsZiA9IHRoaXM7XG4gIHNlbGYuX29wbG9nVXJsID0gb3Bsb2dVcmw7XG4gIHNlbGYuX2RiTmFtZSA9IGRiTmFtZTtcblxuICBzZWxmLl9vcGxvZ0xhc3RFbnRyeUNvbm5lY3Rpb24gPSBudWxsO1xuICBzZWxmLl9vcGxvZ1RhaWxDb25uZWN0aW9uID0gbnVsbDtcbiAgc2VsZi5fc3RvcHBlZCA9IGZhbHNlO1xuICBzZWxmLl90YWlsSGFuZGxlID0gbnVsbDtcbiAgc2VsZi5fcmVhZHlGdXR1cmUgPSBuZXcgRnV0dXJlKCk7XG4gIHNlbGYuX2Nyb3NzYmFyID0gbmV3IEREUFNlcnZlci5fQ3Jvc3NiYXIoe1xuICAgIGZhY3RQYWNrYWdlOiBcIm1vbmdvLWxpdmVkYXRhXCIsIGZhY3ROYW1lOiBcIm9wbG9nLXdhdGNoZXJzXCJcbiAgfSk7XG4gIHNlbGYuX2Jhc2VPcGxvZ1NlbGVjdG9yID0ge1xuICAgIG5zOiBuZXcgUmVnRXhwKFwiXig/OlwiICsgW1xuICAgICAgTWV0ZW9yLl9lc2NhcGVSZWdFeHAoc2VsZi5fZGJOYW1lICsgXCIuXCIpLFxuICAgICAgTWV0ZW9yLl9lc2NhcGVSZWdFeHAoXCJhZG1pbi4kY21kXCIpLFxuICAgIF0uam9pbihcInxcIikgKyBcIilcIiksXG5cbiAgICAkb3I6IFtcbiAgICAgIHsgb3A6IHsgJGluOiBbJ2knLCAndScsICdkJ10gfSB9LFxuICAgICAgLy8gZHJvcCBjb2xsZWN0aW9uXG4gICAgICB7IG9wOiAnYycsICdvLmRyb3AnOiB7ICRleGlzdHM6IHRydWUgfSB9LFxuICAgICAgeyBvcDogJ2MnLCAnby5kcm9wRGF0YWJhc2UnOiAxIH0sXG4gICAgICB7IG9wOiAnYycsICdvLmFwcGx5T3BzJzogeyAkZXhpc3RzOiB0cnVlIH0gfSxcbiAgICBdXG4gIH07XG5cbiAgLy8gRGF0YSBzdHJ1Y3R1cmVzIHRvIHN1cHBvcnQgd2FpdFVudGlsQ2F1Z2h0VXAoKS4gRWFjaCBvcGxvZyBlbnRyeSBoYXMgYVxuICAvLyBNb25nb1RpbWVzdGFtcCBvYmplY3Qgb24gaXQgKHdoaWNoIGlzIG5vdCB0aGUgc2FtZSBhcyBhIERhdGUgLS0tIGl0J3MgYVxuICAvLyBjb21iaW5hdGlvbiBvZiB0aW1lIGFuZCBhbiBpbmNyZW1lbnRpbmcgY291bnRlcjsgc2VlXG4gIC8vIGh0dHA6Ly9kb2NzLm1vbmdvZGIub3JnL21hbnVhbC9yZWZlcmVuY2UvYnNvbi10eXBlcy8jdGltZXN0YW1wcykuXG4gIC8vXG4gIC8vIF9jYXRjaGluZ1VwRnV0dXJlcyBpcyBhbiBhcnJheSBvZiB7dHM6IE1vbmdvVGltZXN0YW1wLCBmdXR1cmU6IEZ1dHVyZX1cbiAgLy8gb2JqZWN0cywgc29ydGVkIGJ5IGFzY2VuZGluZyB0aW1lc3RhbXAuIF9sYXN0UHJvY2Vzc2VkVFMgaXMgdGhlXG4gIC8vIE1vbmdvVGltZXN0YW1wIG9mIHRoZSBsYXN0IG9wbG9nIGVudHJ5IHdlJ3ZlIHByb2Nlc3NlZC5cbiAgLy9cbiAgLy8gRWFjaCB0aW1lIHdlIGNhbGwgd2FpdFVudGlsQ2F1Z2h0VXAsIHdlIHRha2UgYSBwZWVrIGF0IHRoZSBmaW5hbCBvcGxvZ1xuICAvLyBlbnRyeSBpbiB0aGUgZGIuICBJZiB3ZSd2ZSBhbHJlYWR5IHByb2Nlc3NlZCBpdCAoaWUsIGl0IGlzIG5vdCBncmVhdGVyIHRoYW5cbiAgLy8gX2xhc3RQcm9jZXNzZWRUUyksIHdhaXRVbnRpbENhdWdodFVwIGltbWVkaWF0ZWx5IHJldHVybnMuIE90aGVyd2lzZSxcbiAgLy8gd2FpdFVudGlsQ2F1Z2h0VXAgbWFrZXMgYSBuZXcgRnV0dXJlIGFuZCBpbnNlcnRzIGl0IGFsb25nIHdpdGggdGhlIGZpbmFsXG4gIC8vIHRpbWVzdGFtcCBlbnRyeSB0aGF0IGl0IHJlYWQsIGludG8gX2NhdGNoaW5nVXBGdXR1cmVzLiB3YWl0VW50aWxDYXVnaHRVcFxuICAvLyB0aGVuIHdhaXRzIG9uIHRoYXQgZnV0dXJlLCB3aGljaCBpcyByZXNvbHZlZCBvbmNlIF9sYXN0UHJvY2Vzc2VkVFMgaXNcbiAgLy8gaW5jcmVtZW50ZWQgdG8gYmUgcGFzdCBpdHMgdGltZXN0YW1wIGJ5IHRoZSB3b3JrZXIgZmliZXIuXG4gIC8vXG4gIC8vIFhYWCB1c2UgYSBwcmlvcml0eSBxdWV1ZSBvciBzb21ldGhpbmcgZWxzZSB0aGF0J3MgZmFzdGVyIHRoYW4gYW4gYXJyYXlcbiAgc2VsZi5fY2F0Y2hpbmdVcEZ1dHVyZXMgPSBbXTtcbiAgc2VsZi5fbGFzdFByb2Nlc3NlZFRTID0gbnVsbDtcblxuICBzZWxmLl9vblNraXBwZWRFbnRyaWVzSG9vayA9IG5ldyBIb29rKHtcbiAgICBkZWJ1Z1ByaW50RXhjZXB0aW9uczogXCJvblNraXBwZWRFbnRyaWVzIGNhbGxiYWNrXCJcbiAgfSk7XG5cbiAgc2VsZi5fZW50cnlRdWV1ZSA9IG5ldyBNZXRlb3IuX0RvdWJsZUVuZGVkUXVldWUoKTtcbiAgc2VsZi5fd29ya2VyQWN0aXZlID0gZmFsc2U7XG5cbiAgc2VsZi5fc3RhcnRUYWlsaW5nKCk7XG59O1xuXG5PYmplY3QuYXNzaWduKE9wbG9nSGFuZGxlLnByb3RvdHlwZSwge1xuICBzdG9wOiBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIGlmIChzZWxmLl9zdG9wcGVkKVxuICAgICAgcmV0dXJuO1xuICAgIHNlbGYuX3N0b3BwZWQgPSB0cnVlO1xuICAgIGlmIChzZWxmLl90YWlsSGFuZGxlKVxuICAgICAgc2VsZi5fdGFpbEhhbmRsZS5zdG9wKCk7XG4gICAgLy8gWFhYIHNob3VsZCBjbG9zZSBjb25uZWN0aW9ucyB0b29cbiAgfSxcbiAgb25PcGxvZ0VudHJ5OiBmdW5jdGlvbiAodHJpZ2dlciwgY2FsbGJhY2spIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgaWYgKHNlbGYuX3N0b3BwZWQpXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJDYWxsZWQgb25PcGxvZ0VudHJ5IG9uIHN0b3BwZWQgaGFuZGxlIVwiKTtcblxuICAgIC8vIENhbGxpbmcgb25PcGxvZ0VudHJ5IHJlcXVpcmVzIHVzIHRvIHdhaXQgZm9yIHRoZSB0YWlsaW5nIHRvIGJlIHJlYWR5LlxuICAgIHNlbGYuX3JlYWR5RnV0dXJlLndhaXQoKTtcblxuICAgIHZhciBvcmlnaW5hbENhbGxiYWNrID0gY2FsbGJhY2s7XG4gICAgY2FsbGJhY2sgPSBNZXRlb3IuYmluZEVudmlyb25tZW50KGZ1bmN0aW9uIChub3RpZmljYXRpb24pIHtcbiAgICAgIG9yaWdpbmFsQ2FsbGJhY2sobm90aWZpY2F0aW9uKTtcbiAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICBNZXRlb3IuX2RlYnVnKFwiRXJyb3IgaW4gb3Bsb2cgY2FsbGJhY2tcIiwgZXJyKTtcbiAgICB9KTtcbiAgICB2YXIgbGlzdGVuSGFuZGxlID0gc2VsZi5fY3Jvc3NiYXIubGlzdGVuKHRyaWdnZXIsIGNhbGxiYWNrKTtcbiAgICByZXR1cm4ge1xuICAgICAgc3RvcDogZnVuY3Rpb24gKCkge1xuICAgICAgICBsaXN0ZW5IYW5kbGUuc3RvcCgpO1xuICAgICAgfVxuICAgIH07XG4gIH0sXG4gIC8vIFJlZ2lzdGVyIGEgY2FsbGJhY2sgdG8gYmUgaW52b2tlZCBhbnkgdGltZSB3ZSBza2lwIG9wbG9nIGVudHJpZXMgKGVnLFxuICAvLyBiZWNhdXNlIHdlIGFyZSB0b28gZmFyIGJlaGluZCkuXG4gIG9uU2tpcHBlZEVudHJpZXM6IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICBpZiAoc2VsZi5fc3RvcHBlZClcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIkNhbGxlZCBvblNraXBwZWRFbnRyaWVzIG9uIHN0b3BwZWQgaGFuZGxlIVwiKTtcbiAgICByZXR1cm4gc2VsZi5fb25Ta2lwcGVkRW50cmllc0hvb2sucmVnaXN0ZXIoY2FsbGJhY2spO1xuICB9LFxuICAvLyBDYWxscyBgY2FsbGJhY2tgIG9uY2UgdGhlIG9wbG9nIGhhcyBiZWVuIHByb2Nlc3NlZCB1cCB0byBhIHBvaW50IHRoYXQgaXNcbiAgLy8gcm91Z2hseSBcIm5vd1wiOiBzcGVjaWZpY2FsbHksIG9uY2Ugd2UndmUgcHJvY2Vzc2VkIGFsbCBvcHMgdGhhdCBhcmVcbiAgLy8gY3VycmVudGx5IHZpc2libGUuXG4gIC8vIFhYWCBiZWNvbWUgY29udmluY2VkIHRoYXQgdGhpcyBpcyBhY3R1YWxseSBzYWZlIGV2ZW4gaWYgb3Bsb2dDb25uZWN0aW9uXG4gIC8vIGlzIHNvbWUga2luZCBvZiBwb29sXG4gIHdhaXRVbnRpbENhdWdodFVwOiBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIGlmIChzZWxmLl9zdG9wcGVkKVxuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiQ2FsbGVkIHdhaXRVbnRpbENhdWdodFVwIG9uIHN0b3BwZWQgaGFuZGxlIVwiKTtcblxuICAgIC8vIENhbGxpbmcgd2FpdFVudGlsQ2F1Z2h0VXAgcmVxdXJpZXMgdXMgdG8gd2FpdCBmb3IgdGhlIG9wbG9nIGNvbm5lY3Rpb24gdG9cbiAgICAvLyBiZSByZWFkeS5cbiAgICBzZWxmLl9yZWFkeUZ1dHVyZS53YWl0KCk7XG4gICAgdmFyIGxhc3RFbnRyeTtcblxuICAgIHdoaWxlICghc2VsZi5fc3RvcHBlZCkge1xuICAgICAgLy8gV2UgbmVlZCB0byBtYWtlIHRoZSBzZWxlY3RvciBhdCBsZWFzdCBhcyByZXN0cmljdGl2ZSBhcyB0aGUgYWN0dWFsXG4gICAgICAvLyB0YWlsaW5nIHNlbGVjdG9yIChpZSwgd2UgbmVlZCB0byBzcGVjaWZ5IHRoZSBEQiBuYW1lKSBvciBlbHNlIHdlIG1pZ2h0XG4gICAgICAvLyBmaW5kIGEgVFMgdGhhdCB3b24ndCBzaG93IHVwIGluIHRoZSBhY3R1YWwgdGFpbCBzdHJlYW0uXG4gICAgICB0cnkge1xuICAgICAgICBsYXN0RW50cnkgPSBzZWxmLl9vcGxvZ0xhc3RFbnRyeUNvbm5lY3Rpb24uZmluZE9uZShcbiAgICAgICAgICBPUExPR19DT0xMRUNUSU9OLCBzZWxmLl9iYXNlT3Bsb2dTZWxlY3RvcixcbiAgICAgICAgICB7cHJvamVjdGlvbjoge3RzOiAxfSwgc29ydDogeyRuYXR1cmFsOiAtMX19KTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIC8vIER1cmluZyBmYWlsb3ZlciAoZWcpIGlmIHdlIGdldCBhbiBleGNlcHRpb24gd2Ugc2hvdWxkIGxvZyBhbmQgcmV0cnlcbiAgICAgICAgLy8gaW5zdGVhZCBvZiBjcmFzaGluZy5cbiAgICAgICAgTWV0ZW9yLl9kZWJ1ZyhcIkdvdCBleGNlcHRpb24gd2hpbGUgcmVhZGluZyBsYXN0IGVudHJ5XCIsIGUpO1xuICAgICAgICBNZXRlb3IuX3NsZWVwRm9yTXMoMTAwKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoc2VsZi5fc3RvcHBlZClcbiAgICAgIHJldHVybjtcblxuICAgIGlmICghbGFzdEVudHJ5KSB7XG4gICAgICAvLyBSZWFsbHksIG5vdGhpbmcgaW4gdGhlIG9wbG9nPyBXZWxsLCB3ZSd2ZSBwcm9jZXNzZWQgZXZlcnl0aGluZy5cbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB2YXIgdHMgPSBsYXN0RW50cnkudHM7XG4gICAgaWYgKCF0cylcbiAgICAgIHRocm93IEVycm9yKFwib3Bsb2cgZW50cnkgd2l0aG91dCB0czogXCIgKyBFSlNPTi5zdHJpbmdpZnkobGFzdEVudHJ5KSk7XG5cbiAgICBpZiAoc2VsZi5fbGFzdFByb2Nlc3NlZFRTICYmIHRzLmxlc3NUaGFuT3JFcXVhbChzZWxmLl9sYXN0UHJvY2Vzc2VkVFMpKSB7XG4gICAgICAvLyBXZSd2ZSBhbHJlYWR5IGNhdWdodCB1cCB0byBoZXJlLlxuICAgICAgcmV0dXJuO1xuICAgIH1cblxuXG4gICAgLy8gSW5zZXJ0IHRoZSBmdXR1cmUgaW50byBvdXIgbGlzdC4gQWxtb3N0IGFsd2F5cywgdGhpcyB3aWxsIGJlIGF0IHRoZSBlbmQsXG4gICAgLy8gYnV0IGl0J3MgY29uY2VpdmFibGUgdGhhdCBpZiB3ZSBmYWlsIG92ZXIgZnJvbSBvbmUgcHJpbWFyeSB0byBhbm90aGVyLFxuICAgIC8vIHRoZSBvcGxvZyBlbnRyaWVzIHdlIHNlZSB3aWxsIGdvIGJhY2t3YXJkcy5cbiAgICB2YXIgaW5zZXJ0QWZ0ZXIgPSBzZWxmLl9jYXRjaGluZ1VwRnV0dXJlcy5sZW5ndGg7XG4gICAgd2hpbGUgKGluc2VydEFmdGVyIC0gMSA+IDAgJiYgc2VsZi5fY2F0Y2hpbmdVcEZ1dHVyZXNbaW5zZXJ0QWZ0ZXIgLSAxXS50cy5ncmVhdGVyVGhhbih0cykpIHtcbiAgICAgIGluc2VydEFmdGVyLS07XG4gICAgfVxuICAgIHZhciBmID0gbmV3IEZ1dHVyZTtcbiAgICBzZWxmLl9jYXRjaGluZ1VwRnV0dXJlcy5zcGxpY2UoaW5zZXJ0QWZ0ZXIsIDAsIHt0czogdHMsIGZ1dHVyZTogZn0pO1xuICAgIGYud2FpdCgpO1xuICB9LFxuICBfc3RhcnRUYWlsaW5nOiBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIC8vIEZpcnN0LCBtYWtlIHN1cmUgdGhhdCB3ZSdyZSB0YWxraW5nIHRvIHRoZSBsb2NhbCBkYXRhYmFzZS5cbiAgICB2YXIgbW9uZ29kYlVyaSA9IE5wbS5yZXF1aXJlKCdtb25nb2RiLXVyaScpO1xuICAgIGlmIChtb25nb2RiVXJpLnBhcnNlKHNlbGYuX29wbG9nVXJsKS5kYXRhYmFzZSAhPT0gJ2xvY2FsJykge1xuICAgICAgdGhyb3cgRXJyb3IoXCIkTU9OR09fT1BMT0dfVVJMIG11c3QgYmUgc2V0IHRvIHRoZSAnbG9jYWwnIGRhdGFiYXNlIG9mIFwiICtcbiAgICAgICAgICAgICAgICAgIFwiYSBNb25nbyByZXBsaWNhIHNldFwiKTtcbiAgICB9XG5cbiAgICAvLyBXZSBtYWtlIHR3byBzZXBhcmF0ZSBjb25uZWN0aW9ucyB0byBNb25nby4gVGhlIE5vZGUgTW9uZ28gZHJpdmVyXG4gICAgLy8gaW1wbGVtZW50cyBhIG5haXZlIHJvdW5kLXJvYmluIGNvbm5lY3Rpb24gcG9vbDogZWFjaCBcImNvbm5lY3Rpb25cIiBpcyBhXG4gICAgLy8gcG9vbCBvZiBzZXZlcmFsICg1IGJ5IGRlZmF1bHQpIFRDUCBjb25uZWN0aW9ucywgYW5kIGVhY2ggcmVxdWVzdCBpc1xuICAgIC8vIHJvdGF0ZWQgdGhyb3VnaCB0aGUgcG9vbHMuIFRhaWxhYmxlIGN1cnNvciBxdWVyaWVzIGJsb2NrIG9uIHRoZSBzZXJ2ZXJcbiAgICAvLyB1bnRpbCB0aGVyZSBpcyBzb21lIGRhdGEgdG8gcmV0dXJuIChvciB1bnRpbCBhIGZldyBzZWNvbmRzIGhhdmVcbiAgICAvLyBwYXNzZWQpLiBTbyBpZiB0aGUgY29ubmVjdGlvbiBwb29sIHVzZWQgZm9yIHRhaWxpbmcgY3Vyc29ycyBpcyB0aGUgc2FtZVxuICAgIC8vIHBvb2wgdXNlZCBmb3Igb3RoZXIgcXVlcmllcywgdGhlIG90aGVyIHF1ZXJpZXMgd2lsbCBiZSBkZWxheWVkIGJ5IHNlY29uZHNcbiAgICAvLyAxLzUgb2YgdGhlIHRpbWUuXG4gICAgLy9cbiAgICAvLyBUaGUgdGFpbCBjb25uZWN0aW9uIHdpbGwgb25seSBldmVyIGJlIHJ1bm5pbmcgYSBzaW5nbGUgdGFpbCBjb21tYW5kLCBzb1xuICAgIC8vIGl0IG9ubHkgbmVlZHMgdG8gbWFrZSBvbmUgdW5kZXJseWluZyBUQ1AgY29ubmVjdGlvbi5cbiAgICBzZWxmLl9vcGxvZ1RhaWxDb25uZWN0aW9uID0gbmV3IE1vbmdvQ29ubmVjdGlvbihcbiAgICAgIHNlbGYuX29wbG9nVXJsLCB7bWF4UG9vbFNpemU6IDF9KTtcbiAgICAvLyBYWFggYmV0dGVyIGRvY3MsIGJ1dDogaXQncyB0byBnZXQgbW9ub3RvbmljIHJlc3VsdHNcbiAgICAvLyBYWFggaXMgaXQgc2FmZSB0byBzYXkgXCJpZiB0aGVyZSdzIGFuIGluIGZsaWdodCBxdWVyeSwganVzdCB1c2UgaXRzXG4gICAgLy8gICAgIHJlc3VsdHNcIj8gSSBkb24ndCB0aGluayBzbyBidXQgc2hvdWxkIGNvbnNpZGVyIHRoYXRcbiAgICBzZWxmLl9vcGxvZ0xhc3RFbnRyeUNvbm5lY3Rpb24gPSBuZXcgTW9uZ29Db25uZWN0aW9uKFxuICAgICAgc2VsZi5fb3Bsb2dVcmwsIHttYXhQb29sU2l6ZTogMX0pO1xuXG4gICAgLy8gTm93LCBtYWtlIHN1cmUgdGhhdCB0aGVyZSBhY3R1YWxseSBpcyBhIHJlcGwgc2V0IGhlcmUuIElmIG5vdCwgb3Bsb2dcbiAgICAvLyB0YWlsaW5nIHdvbid0IGV2ZXIgZmluZCBhbnl0aGluZyFcbiAgICAvLyBNb3JlIG9uIHRoZSBpc01hc3RlckRvY1xuICAgIC8vIGh0dHBzOi8vZG9jcy5tb25nb2RiLmNvbS9tYW51YWwvcmVmZXJlbmNlL2NvbW1hbmQvaXNNYXN0ZXIvXG4gICAgdmFyIGYgPSBuZXcgRnV0dXJlO1xuICAgIHNlbGYuX29wbG9nTGFzdEVudHJ5Q29ubmVjdGlvbi5kYi5hZG1pbigpLmNvbW1hbmQoXG4gICAgICB7IGlzbWFzdGVyOiAxIH0sIGYucmVzb2x2ZXIoKSk7XG4gICAgdmFyIGlzTWFzdGVyRG9jID0gZi53YWl0KCk7XG5cbiAgICBpZiAoIShpc01hc3RlckRvYyAmJiBpc01hc3RlckRvYy5zZXROYW1lKSkge1xuICAgICAgdGhyb3cgRXJyb3IoXCIkTU9OR09fT1BMT0dfVVJMIG11c3QgYmUgc2V0IHRvIHRoZSAnbG9jYWwnIGRhdGFiYXNlIG9mIFwiICtcbiAgICAgICAgICAgICAgICAgIFwiYSBNb25nbyByZXBsaWNhIHNldFwiKTtcbiAgICB9XG5cbiAgICAvLyBGaW5kIHRoZSBsYXN0IG9wbG9nIGVudHJ5LlxuICAgIHZhciBsYXN0T3Bsb2dFbnRyeSA9IHNlbGYuX29wbG9nTGFzdEVudHJ5Q29ubmVjdGlvbi5maW5kT25lKFxuICAgICAgT1BMT0dfQ09MTEVDVElPTiwge30sIHtzb3J0OiB7JG5hdHVyYWw6IC0xfSwgcHJvamVjdGlvbjoge3RzOiAxfX0pO1xuXG4gICAgdmFyIG9wbG9nU2VsZWN0b3IgPSBfLmNsb25lKHNlbGYuX2Jhc2VPcGxvZ1NlbGVjdG9yKTtcbiAgICBpZiAobGFzdE9wbG9nRW50cnkpIHtcbiAgICAgIC8vIFN0YXJ0IGFmdGVyIHRoZSBsYXN0IGVudHJ5IHRoYXQgY3VycmVudGx5IGV4aXN0cy5cbiAgICAgIG9wbG9nU2VsZWN0b3IudHMgPSB7JGd0OiBsYXN0T3Bsb2dFbnRyeS50c307XG4gICAgICAvLyBJZiB0aGVyZSBhcmUgYW55IGNhbGxzIHRvIGNhbGxXaGVuUHJvY2Vzc2VkTGF0ZXN0IGJlZm9yZSBhbnkgb3RoZXJcbiAgICAgIC8vIG9wbG9nIGVudHJpZXMgc2hvdyB1cCwgYWxsb3cgY2FsbFdoZW5Qcm9jZXNzZWRMYXRlc3QgdG8gY2FsbCBpdHNcbiAgICAgIC8vIGNhbGxiYWNrIGltbWVkaWF0ZWx5LlxuICAgICAgc2VsZi5fbGFzdFByb2Nlc3NlZFRTID0gbGFzdE9wbG9nRW50cnkudHM7XG4gICAgfVxuXG4gICAgdmFyIGN1cnNvckRlc2NyaXB0aW9uID0gbmV3IEN1cnNvckRlc2NyaXB0aW9uKFxuICAgICAgT1BMT0dfQ09MTEVDVElPTiwgb3Bsb2dTZWxlY3Rvciwge3RhaWxhYmxlOiB0cnVlfSk7XG5cbiAgICAvLyBTdGFydCB0YWlsaW5nIHRoZSBvcGxvZy5cbiAgICAvL1xuICAgIC8vIFdlIHJlc3RhcnQgdGhlIGxvdy1sZXZlbCBvcGxvZyBxdWVyeSBldmVyeSAzMCBzZWNvbmRzIGlmIHdlIGRpZG4ndCBnZXQgYVxuICAgIC8vIGRvYy4gVGhpcyBpcyBhIHdvcmthcm91bmQgZm9yICM4NTk4OiB0aGUgTm9kZSBNb25nbyBkcml2ZXIgaGFzIGF0IGxlYXN0XG4gICAgLy8gb25lIGJ1ZyB0aGF0IGNhbiBsZWFkIHRvIHF1ZXJ5IGNhbGxiYWNrcyBuZXZlciBnZXR0aW5nIGNhbGxlZCAoZXZlbiB3aXRoXG4gICAgLy8gYW4gZXJyb3IpIHdoZW4gbGVhZGVyc2hpcCBmYWlsb3ZlciBvY2N1ci5cbiAgICBzZWxmLl90YWlsSGFuZGxlID0gc2VsZi5fb3Bsb2dUYWlsQ29ubmVjdGlvbi50YWlsKFxuICAgICAgY3Vyc29yRGVzY3JpcHRpb24sXG4gICAgICBmdW5jdGlvbiAoZG9jKSB7XG4gICAgICAgIHNlbGYuX2VudHJ5UXVldWUucHVzaChkb2MpO1xuICAgICAgICBzZWxmLl9tYXliZVN0YXJ0V29ya2VyKCk7XG4gICAgICB9LFxuICAgICAgVEFJTF9USU1FT1VUXG4gICAgKTtcbiAgICBzZWxmLl9yZWFkeUZ1dHVyZS5yZXR1cm4oKTtcbiAgfSxcblxuICBfbWF5YmVTdGFydFdvcmtlcjogZnVuY3Rpb24gKCkge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICBpZiAoc2VsZi5fd29ya2VyQWN0aXZlKSByZXR1cm47XG4gICAgc2VsZi5fd29ya2VyQWN0aXZlID0gdHJ1ZTtcblxuICAgIE1ldGVvci5kZWZlcihmdW5jdGlvbiAoKSB7XG4gICAgICAvLyBNYXkgYmUgY2FsbGVkIHJlY3Vyc2l2ZWx5IGluIGNhc2Ugb2YgdHJhbnNhY3Rpb25zLlxuICAgICAgZnVuY3Rpb24gaGFuZGxlRG9jKGRvYykge1xuICAgICAgICBpZiAoZG9jLm5zID09PSBcImFkbWluLiRjbWRcIikge1xuICAgICAgICAgIGlmIChkb2Muby5hcHBseU9wcykge1xuICAgICAgICAgICAgLy8gVGhpcyB3YXMgYSBzdWNjZXNzZnVsIHRyYW5zYWN0aW9uLCBzbyB3ZSBuZWVkIHRvIGFwcGx5IHRoZVxuICAgICAgICAgICAgLy8gb3BlcmF0aW9ucyB0aGF0IHdlcmUgaW52b2x2ZWQuXG4gICAgICAgICAgICBsZXQgbmV4dFRpbWVzdGFtcCA9IGRvYy50cztcbiAgICAgICAgICAgIGRvYy5vLmFwcGx5T3BzLmZvckVhY2gob3AgPT4ge1xuICAgICAgICAgICAgICAvLyBTZWUgaHR0cHM6Ly9naXRodWIuY29tL21ldGVvci9tZXRlb3IvaXNzdWVzLzEwNDIwLlxuICAgICAgICAgICAgICBpZiAoIW9wLnRzKSB7XG4gICAgICAgICAgICAgICAgb3AudHMgPSBuZXh0VGltZXN0YW1wO1xuICAgICAgICAgICAgICAgIG5leHRUaW1lc3RhbXAgPSBuZXh0VGltZXN0YW1wLmFkZChMb25nLk9ORSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgaGFuZGxlRG9jKG9wKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJVbmtub3duIGNvbW1hbmQgXCIgKyBFSlNPTi5zdHJpbmdpZnkoZG9jKSk7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCB0cmlnZ2VyID0ge1xuICAgICAgICAgIGRyb3BDb2xsZWN0aW9uOiBmYWxzZSxcbiAgICAgICAgICBkcm9wRGF0YWJhc2U6IGZhbHNlLFxuICAgICAgICAgIG9wOiBkb2MsXG4gICAgICAgIH07XG5cbiAgICAgICAgaWYgKHR5cGVvZiBkb2MubnMgPT09IFwic3RyaW5nXCIgJiZcbiAgICAgICAgICAgIGRvYy5ucy5zdGFydHNXaXRoKHNlbGYuX2RiTmFtZSArIFwiLlwiKSkge1xuICAgICAgICAgIHRyaWdnZXIuY29sbGVjdGlvbiA9IGRvYy5ucy5zbGljZShzZWxmLl9kYk5hbWUubGVuZ3RoICsgMSk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBJcyBpdCBhIHNwZWNpYWwgY29tbWFuZCBhbmQgdGhlIGNvbGxlY3Rpb24gbmFtZSBpcyBoaWRkZW5cbiAgICAgICAgLy8gc29tZXdoZXJlIGluIG9wZXJhdG9yP1xuICAgICAgICBpZiAodHJpZ2dlci5jb2xsZWN0aW9uID09PSBcIiRjbWRcIikge1xuICAgICAgICAgIGlmIChkb2Muby5kcm9wRGF0YWJhc2UpIHtcbiAgICAgICAgICAgIGRlbGV0ZSB0cmlnZ2VyLmNvbGxlY3Rpb247XG4gICAgICAgICAgICB0cmlnZ2VyLmRyb3BEYXRhYmFzZSA9IHRydWU7XG4gICAgICAgICAgfSBlbHNlIGlmIChfLmhhcyhkb2MubywgXCJkcm9wXCIpKSB7XG4gICAgICAgICAgICB0cmlnZ2VyLmNvbGxlY3Rpb24gPSBkb2Muby5kcm9wO1xuICAgICAgICAgICAgdHJpZ2dlci5kcm9wQ29sbGVjdGlvbiA9IHRydWU7XG4gICAgICAgICAgICB0cmlnZ2VyLmlkID0gbnVsbDtcbiAgICAgICAgICB9IGVsc2UgaWYgKFwiY3JlYXRlXCIgaW4gZG9jLm8gJiYgXCJpZEluZGV4XCIgaW4gZG9jLm8pIHtcbiAgICAgICAgICAgIC8vIEEgY29sbGVjdGlvbiBnb3QgaW1wbGljaXRseSBjcmVhdGVkIHdpdGhpbiBhIHRyYW5zYWN0aW9uLiBUaGVyZSdzXG4gICAgICAgICAgICAvLyBubyBuZWVkIHRvIGRvIGFueXRoaW5nIGFib3V0IGl0LlxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aHJvdyBFcnJvcihcIlVua25vd24gY29tbWFuZCBcIiArIEVKU09OLnN0cmluZ2lmeShkb2MpKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBBbGwgb3RoZXIgb3BzIGhhdmUgYW4gaWQuXG4gICAgICAgICAgdHJpZ2dlci5pZCA9IGlkRm9yT3AoZG9jKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHNlbGYuX2Nyb3NzYmFyLmZpcmUodHJpZ2dlcik7XG4gICAgICB9XG5cbiAgICAgIHRyeSB7XG4gICAgICAgIHdoaWxlICghIHNlbGYuX3N0b3BwZWQgJiZcbiAgICAgICAgICAgICAgICEgc2VsZi5fZW50cnlRdWV1ZS5pc0VtcHR5KCkpIHtcbiAgICAgICAgICAvLyBBcmUgd2UgdG9vIGZhciBiZWhpbmQ/IEp1c3QgdGVsbCBvdXIgb2JzZXJ2ZXJzIHRoYXQgdGhleSBuZWVkIHRvXG4gICAgICAgICAgLy8gcmVwb2xsLCBhbmQgZHJvcCBvdXIgcXVldWUuXG4gICAgICAgICAgaWYgKHNlbGYuX2VudHJ5UXVldWUubGVuZ3RoID4gVE9PX0ZBUl9CRUhJTkQpIHtcbiAgICAgICAgICAgIHZhciBsYXN0RW50cnkgPSBzZWxmLl9lbnRyeVF1ZXVlLnBvcCgpO1xuICAgICAgICAgICAgc2VsZi5fZW50cnlRdWV1ZS5jbGVhcigpO1xuXG4gICAgICAgICAgICBzZWxmLl9vblNraXBwZWRFbnRyaWVzSG9vay5lYWNoKGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICAgICAgICAgICAgICBjYWxsYmFjaygpO1xuICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAvLyBGcmVlIGFueSB3YWl0VW50aWxDYXVnaHRVcCgpIGNhbGxzIHRoYXQgd2VyZSB3YWl0aW5nIGZvciB1cyB0b1xuICAgICAgICAgICAgLy8gcGFzcyBzb21ldGhpbmcgdGhhdCB3ZSBqdXN0IHNraXBwZWQuXG4gICAgICAgICAgICBzZWxmLl9zZXRMYXN0UHJvY2Vzc2VkVFMobGFzdEVudHJ5LnRzKTtcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGNvbnN0IGRvYyA9IHNlbGYuX2VudHJ5UXVldWUuc2hpZnQoKTtcblxuICAgICAgICAgIC8vIEZpcmUgdHJpZ2dlcihzKSBmb3IgdGhpcyBkb2MuXG4gICAgICAgICAgaGFuZGxlRG9jKGRvYyk7XG5cbiAgICAgICAgICAvLyBOb3cgdGhhdCB3ZSd2ZSBwcm9jZXNzZWQgdGhpcyBvcGVyYXRpb24sIHByb2Nlc3MgcGVuZGluZ1xuICAgICAgICAgIC8vIHNlcXVlbmNlcnMuXG4gICAgICAgICAgaWYgKGRvYy50cykge1xuICAgICAgICAgICAgc2VsZi5fc2V0TGFzdFByb2Nlc3NlZFRTKGRvYy50cyk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRocm93IEVycm9yKFwib3Bsb2cgZW50cnkgd2l0aG91dCB0czogXCIgKyBFSlNPTi5zdHJpbmdpZnkoZG9jKSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9IGZpbmFsbHkge1xuICAgICAgICBzZWxmLl93b3JrZXJBY3RpdmUgPSBmYWxzZTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfSxcblxuICBfc2V0TGFzdFByb2Nlc3NlZFRTOiBmdW5jdGlvbiAodHMpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgc2VsZi5fbGFzdFByb2Nlc3NlZFRTID0gdHM7XG4gICAgd2hpbGUgKCFfLmlzRW1wdHkoc2VsZi5fY2F0Y2hpbmdVcEZ1dHVyZXMpICYmIHNlbGYuX2NhdGNoaW5nVXBGdXR1cmVzWzBdLnRzLmxlc3NUaGFuT3JFcXVhbChzZWxmLl9sYXN0UHJvY2Vzc2VkVFMpKSB7XG4gICAgICB2YXIgc2VxdWVuY2VyID0gc2VsZi5fY2F0Y2hpbmdVcEZ1dHVyZXMuc2hpZnQoKTtcbiAgICAgIHNlcXVlbmNlci5mdXR1cmUucmV0dXJuKCk7XG4gICAgfVxuICB9LFxuXG4gIC8vTWV0aG9kcyB1c2VkIG9uIHRlc3RzIHRvIGRpbmFtaWNhbGx5IGNoYW5nZSBUT09fRkFSX0JFSElORFxuICBfZGVmaW5lVG9vRmFyQmVoaW5kOiBmdW5jdGlvbih2YWx1ZSkge1xuICAgIFRPT19GQVJfQkVISU5EID0gdmFsdWU7XG4gIH0sXG4gIF9yZXNldFRvb0ZhckJlaGluZDogZnVuY3Rpb24oKSB7XG4gICAgVE9PX0ZBUl9CRUhJTkQgPSBwcm9jZXNzLmVudi5NRVRFT1JfT1BMT0dfVE9PX0ZBUl9CRUhJTkQgfHwgMjAwMDtcbiAgfVxufSk7XG4iLCJ2YXIgRnV0dXJlID0gTnBtLnJlcXVpcmUoJ2ZpYmVycy9mdXR1cmUnKTtcblxuT2JzZXJ2ZU11bHRpcGxleGVyID0gZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gIGlmICghb3B0aW9ucyB8fCAhXy5oYXMob3B0aW9ucywgJ29yZGVyZWQnKSlcbiAgICB0aHJvdyBFcnJvcihcIm11c3Qgc3BlY2lmaWVkIG9yZGVyZWRcIik7XG5cbiAgUGFja2FnZVsnZmFjdHMtYmFzZSddICYmIFBhY2thZ2VbJ2ZhY3RzLWJhc2UnXS5GYWN0cy5pbmNyZW1lbnRTZXJ2ZXJGYWN0KFxuICAgIFwibW9uZ28tbGl2ZWRhdGFcIiwgXCJvYnNlcnZlLW11bHRpcGxleGVyc1wiLCAxKTtcblxuICBzZWxmLl9vcmRlcmVkID0gb3B0aW9ucy5vcmRlcmVkO1xuICBzZWxmLl9vblN0b3AgPSBvcHRpb25zLm9uU3RvcCB8fCBmdW5jdGlvbiAoKSB7fTtcbiAgc2VsZi5fcXVldWUgPSBuZXcgTWV0ZW9yLl9TeW5jaHJvbm91c1F1ZXVlKCk7XG4gIHNlbGYuX2hhbmRsZXMgPSB7fTtcbiAgc2VsZi5fcmVhZHlGdXR1cmUgPSBuZXcgRnV0dXJlO1xuICBzZWxmLl9jYWNoZSA9IG5ldyBMb2NhbENvbGxlY3Rpb24uX0NhY2hpbmdDaGFuZ2VPYnNlcnZlcih7XG4gICAgb3JkZXJlZDogb3B0aW9ucy5vcmRlcmVkfSk7XG4gIC8vIE51bWJlciBvZiBhZGRIYW5kbGVBbmRTZW5kSW5pdGlhbEFkZHMgdGFza3Mgc2NoZWR1bGVkIGJ1dCBub3QgeWV0XG4gIC8vIHJ1bm5pbmcuIHJlbW92ZUhhbmRsZSB1c2VzIHRoaXMgdG8ga25vdyBpZiBpdCdzIHRpbWUgdG8gY2FsbCB0aGUgb25TdG9wXG4gIC8vIGNhbGxiYWNrLlxuICBzZWxmLl9hZGRIYW5kbGVUYXNrc1NjaGVkdWxlZEJ1dE5vdFBlcmZvcm1lZCA9IDA7XG5cbiAgXy5lYWNoKHNlbGYuY2FsbGJhY2tOYW1lcygpLCBmdW5jdGlvbiAoY2FsbGJhY2tOYW1lKSB7XG4gICAgc2VsZltjYWxsYmFja05hbWVdID0gZnVuY3Rpb24gKC8qIC4uLiAqLykge1xuICAgICAgc2VsZi5fYXBwbHlDYWxsYmFjayhjYWxsYmFja05hbWUsIF8udG9BcnJheShhcmd1bWVudHMpKTtcbiAgICB9O1xuICB9KTtcbn07XG5cbl8uZXh0ZW5kKE9ic2VydmVNdWx0aXBsZXhlci5wcm90b3R5cGUsIHtcbiAgYWRkSGFuZGxlQW5kU2VuZEluaXRpYWxBZGRzOiBmdW5jdGlvbiAoaGFuZGxlKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gICAgLy8gQ2hlY2sgdGhpcyBiZWZvcmUgY2FsbGluZyBydW5UYXNrIChldmVuIHRob3VnaCBydW5UYXNrIGRvZXMgdGhlIHNhbWVcbiAgICAvLyBjaGVjaykgc28gdGhhdCB3ZSBkb24ndCBsZWFrIGFuIE9ic2VydmVNdWx0aXBsZXhlciBvbiBlcnJvciBieVxuICAgIC8vIGluY3JlbWVudGluZyBfYWRkSGFuZGxlVGFza3NTY2hlZHVsZWRCdXROb3RQZXJmb3JtZWQgYW5kIG5ldmVyXG4gICAgLy8gZGVjcmVtZW50aW5nIGl0LlxuICAgIGlmICghc2VsZi5fcXVldWUuc2FmZVRvUnVuVGFzaygpKVxuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiQ2FuJ3QgY2FsbCBvYnNlcnZlQ2hhbmdlcyBmcm9tIGFuIG9ic2VydmUgY2FsbGJhY2sgb24gdGhlIHNhbWUgcXVlcnlcIik7XG4gICAgKytzZWxmLl9hZGRIYW5kbGVUYXNrc1NjaGVkdWxlZEJ1dE5vdFBlcmZvcm1lZDtcblxuICAgIFBhY2thZ2VbJ2ZhY3RzLWJhc2UnXSAmJiBQYWNrYWdlWydmYWN0cy1iYXNlJ10uRmFjdHMuaW5jcmVtZW50U2VydmVyRmFjdChcbiAgICAgIFwibW9uZ28tbGl2ZWRhdGFcIiwgXCJvYnNlcnZlLWhhbmRsZXNcIiwgMSk7XG5cbiAgICBzZWxmLl9xdWV1ZS5ydW5UYXNrKGZ1bmN0aW9uICgpIHtcbiAgICAgIHNlbGYuX2hhbmRsZXNbaGFuZGxlLl9pZF0gPSBoYW5kbGU7XG4gICAgICAvLyBTZW5kIG91dCB3aGF0ZXZlciBhZGRzIHdlIGhhdmUgc28gZmFyICh3aGV0aGVyIG9yIG5vdCB3ZSB0aGVcbiAgICAgIC8vIG11bHRpcGxleGVyIGlzIHJlYWR5KS5cbiAgICAgIHNlbGYuX3NlbmRBZGRzKGhhbmRsZSk7XG4gICAgICAtLXNlbGYuX2FkZEhhbmRsZVRhc2tzU2NoZWR1bGVkQnV0Tm90UGVyZm9ybWVkO1xuICAgIH0pO1xuICAgIC8vICpvdXRzaWRlKiB0aGUgdGFzaywgc2luY2Ugb3RoZXJ3aXNlIHdlJ2QgZGVhZGxvY2tcbiAgICBzZWxmLl9yZWFkeUZ1dHVyZS53YWl0KCk7XG4gIH0sXG5cbiAgLy8gUmVtb3ZlIGFuIG9ic2VydmUgaGFuZGxlLiBJZiBpdCB3YXMgdGhlIGxhc3Qgb2JzZXJ2ZSBoYW5kbGUsIGNhbGwgdGhlXG4gIC8vIG9uU3RvcCBjYWxsYmFjazsgeW91IGNhbm5vdCBhZGQgYW55IG1vcmUgb2JzZXJ2ZSBoYW5kbGVzIGFmdGVyIHRoaXMuXG4gIC8vXG4gIC8vIFRoaXMgaXMgbm90IHN5bmNocm9uaXplZCB3aXRoIHBvbGxzIGFuZCBoYW5kbGUgYWRkaXRpb25zOiB0aGlzIG1lYW5zIHRoYXRcbiAgLy8geW91IGNhbiBzYWZlbHkgY2FsbCBpdCBmcm9tIHdpdGhpbiBhbiBvYnNlcnZlIGNhbGxiYWNrLCBidXQgaXQgYWxzbyBtZWFuc1xuICAvLyB0aGF0IHdlIGhhdmUgdG8gYmUgY2FyZWZ1bCB3aGVuIHdlIGl0ZXJhdGUgb3ZlciBfaGFuZGxlcy5cbiAgcmVtb3ZlSGFuZGxlOiBmdW5jdGlvbiAoaWQpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgICAvLyBUaGlzIHNob3VsZCBub3QgYmUgcG9zc2libGU6IHlvdSBjYW4gb25seSBjYWxsIHJlbW92ZUhhbmRsZSBieSBoYXZpbmdcbiAgICAvLyBhY2Nlc3MgdG8gdGhlIE9ic2VydmVIYW5kbGUsIHdoaWNoIGlzbid0IHJldHVybmVkIHRvIHVzZXIgY29kZSB1bnRpbCB0aGVcbiAgICAvLyBtdWx0aXBsZXggaXMgcmVhZHkuXG4gICAgaWYgKCFzZWxmLl9yZWFkeSgpKVxuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiQ2FuJ3QgcmVtb3ZlIGhhbmRsZXMgdW50aWwgdGhlIG11bHRpcGxleCBpcyByZWFkeVwiKTtcblxuICAgIGRlbGV0ZSBzZWxmLl9oYW5kbGVzW2lkXTtcblxuICAgIFBhY2thZ2VbJ2ZhY3RzLWJhc2UnXSAmJiBQYWNrYWdlWydmYWN0cy1iYXNlJ10uRmFjdHMuaW5jcmVtZW50U2VydmVyRmFjdChcbiAgICAgIFwibW9uZ28tbGl2ZWRhdGFcIiwgXCJvYnNlcnZlLWhhbmRsZXNcIiwgLTEpO1xuXG4gICAgaWYgKF8uaXNFbXB0eShzZWxmLl9oYW5kbGVzKSAmJlxuICAgICAgICBzZWxmLl9hZGRIYW5kbGVUYXNrc1NjaGVkdWxlZEJ1dE5vdFBlcmZvcm1lZCA9PT0gMCkge1xuICAgICAgc2VsZi5fc3RvcCgpO1xuICAgIH1cbiAgfSxcbiAgX3N0b3A6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuXG4gICAgLy8gSXQgc2hvdWxkbid0IGJlIHBvc3NpYmxlIGZvciB1cyB0byBzdG9wIHdoZW4gYWxsIG91ciBoYW5kbGVzIHN0aWxsXG4gICAgLy8gaGF2ZW4ndCBiZWVuIHJldHVybmVkIGZyb20gb2JzZXJ2ZUNoYW5nZXMhXG4gICAgaWYgKCEgc2VsZi5fcmVhZHkoKSAmJiAhIG9wdGlvbnMuZnJvbVF1ZXJ5RXJyb3IpXG4gICAgICB0aHJvdyBFcnJvcihcInN1cnByaXNpbmcgX3N0b3A6IG5vdCByZWFkeVwiKTtcblxuICAgIC8vIENhbGwgc3RvcCBjYWxsYmFjayAod2hpY2gga2lsbHMgdGhlIHVuZGVybHlpbmcgcHJvY2VzcyB3aGljaCBzZW5kcyB1c1xuICAgIC8vIGNhbGxiYWNrcyBhbmQgcmVtb3ZlcyB1cyBmcm9tIHRoZSBjb25uZWN0aW9uJ3MgZGljdGlvbmFyeSkuXG4gICAgc2VsZi5fb25TdG9wKCk7XG4gICAgUGFja2FnZVsnZmFjdHMtYmFzZSddICYmIFBhY2thZ2VbJ2ZhY3RzLWJhc2UnXS5GYWN0cy5pbmNyZW1lbnRTZXJ2ZXJGYWN0KFxuICAgICAgXCJtb25nby1saXZlZGF0YVwiLCBcIm9ic2VydmUtbXVsdGlwbGV4ZXJzXCIsIC0xKTtcblxuICAgIC8vIENhdXNlIGZ1dHVyZSBhZGRIYW5kbGVBbmRTZW5kSW5pdGlhbEFkZHMgY2FsbHMgdG8gdGhyb3cgKGJ1dCB0aGUgb25TdG9wXG4gICAgLy8gY2FsbGJhY2sgc2hvdWxkIG1ha2Ugb3VyIGNvbm5lY3Rpb24gZm9yZ2V0IGFib3V0IHVzKS5cbiAgICBzZWxmLl9oYW5kbGVzID0gbnVsbDtcbiAgfSxcblxuICAvLyBBbGxvd3MgYWxsIGFkZEhhbmRsZUFuZFNlbmRJbml0aWFsQWRkcyBjYWxscyB0byByZXR1cm4sIG9uY2UgYWxsIHByZWNlZGluZ1xuICAvLyBhZGRzIGhhdmUgYmVlbiBwcm9jZXNzZWQuIERvZXMgbm90IGJsb2NrLlxuICByZWFkeTogZnVuY3Rpb24gKCkge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICBzZWxmLl9xdWV1ZS5xdWV1ZVRhc2soZnVuY3Rpb24gKCkge1xuICAgICAgaWYgKHNlbGYuX3JlYWR5KCkpXG4gICAgICAgIHRocm93IEVycm9yKFwiY2FuJ3QgbWFrZSBPYnNlcnZlTXVsdGlwbGV4IHJlYWR5IHR3aWNlIVwiKTtcbiAgICAgIHNlbGYuX3JlYWR5RnV0dXJlLnJldHVybigpO1xuICAgIH0pO1xuICB9LFxuXG4gIC8vIElmIHRyeWluZyB0byBleGVjdXRlIHRoZSBxdWVyeSByZXN1bHRzIGluIGFuIGVycm9yLCBjYWxsIHRoaXMuIFRoaXMgaXNcbiAgLy8gaW50ZW5kZWQgZm9yIHBlcm1hbmVudCBlcnJvcnMsIG5vdCB0cmFuc2llbnQgbmV0d29yayBlcnJvcnMgdGhhdCBjb3VsZCBiZVxuICAvLyBmaXhlZC4gSXQgc2hvdWxkIG9ubHkgYmUgY2FsbGVkIGJlZm9yZSByZWFkeSgpLCBiZWNhdXNlIGlmIHlvdSBjYWxsZWQgcmVhZHlcbiAgLy8gdGhhdCBtZWFudCB0aGF0IHlvdSBtYW5hZ2VkIHRvIHJ1biB0aGUgcXVlcnkgb25jZS4gSXQgd2lsbCBzdG9wIHRoaXNcbiAgLy8gT2JzZXJ2ZU11bHRpcGxleCBhbmQgY2F1c2UgYWRkSGFuZGxlQW5kU2VuZEluaXRpYWxBZGRzIGNhbGxzIChhbmQgdGh1c1xuICAvLyBvYnNlcnZlQ2hhbmdlcyBjYWxscykgdG8gdGhyb3cgdGhlIGVycm9yLlxuICBxdWVyeUVycm9yOiBmdW5jdGlvbiAoZXJyKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIHNlbGYuX3F1ZXVlLnJ1blRhc2soZnVuY3Rpb24gKCkge1xuICAgICAgaWYgKHNlbGYuX3JlYWR5KCkpXG4gICAgICAgIHRocm93IEVycm9yKFwiY2FuJ3QgY2xhaW0gcXVlcnkgaGFzIGFuIGVycm9yIGFmdGVyIGl0IHdvcmtlZCFcIik7XG4gICAgICBzZWxmLl9zdG9wKHtmcm9tUXVlcnlFcnJvcjogdHJ1ZX0pO1xuICAgICAgc2VsZi5fcmVhZHlGdXR1cmUudGhyb3coZXJyKTtcbiAgICB9KTtcbiAgfSxcblxuICAvLyBDYWxscyBcImNiXCIgb25jZSB0aGUgZWZmZWN0cyBvZiBhbGwgXCJyZWFkeVwiLCBcImFkZEhhbmRsZUFuZFNlbmRJbml0aWFsQWRkc1wiXG4gIC8vIGFuZCBvYnNlcnZlIGNhbGxiYWNrcyB3aGljaCBjYW1lIGJlZm9yZSB0aGlzIGNhbGwgaGF2ZSBiZWVuIHByb3BhZ2F0ZWQgdG9cbiAgLy8gYWxsIGhhbmRsZXMuIFwicmVhZHlcIiBtdXN0IGhhdmUgYWxyZWFkeSBiZWVuIGNhbGxlZCBvbiB0aGlzIG11bHRpcGxleGVyLlxuICBvbkZsdXNoOiBmdW5jdGlvbiAoY2IpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgc2VsZi5fcXVldWUucXVldWVUYXNrKGZ1bmN0aW9uICgpIHtcbiAgICAgIGlmICghc2VsZi5fcmVhZHkoKSlcbiAgICAgICAgdGhyb3cgRXJyb3IoXCJvbmx5IGNhbGwgb25GbHVzaCBvbiBhIG11bHRpcGxleGVyIHRoYXQgd2lsbCBiZSByZWFkeVwiKTtcbiAgICAgIGNiKCk7XG4gICAgfSk7XG4gIH0sXG4gIGNhbGxiYWNrTmFtZXM6IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgaWYgKHNlbGYuX29yZGVyZWQpXG4gICAgICByZXR1cm4gW1wiYWRkZWRCZWZvcmVcIiwgXCJjaGFuZ2VkXCIsIFwibW92ZWRCZWZvcmVcIiwgXCJyZW1vdmVkXCJdO1xuICAgIGVsc2VcbiAgICAgIHJldHVybiBbXCJhZGRlZFwiLCBcImNoYW5nZWRcIiwgXCJyZW1vdmVkXCJdO1xuICB9LFxuICBfcmVhZHk6IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gdGhpcy5fcmVhZHlGdXR1cmUuaXNSZXNvbHZlZCgpO1xuICB9LFxuICBfYXBwbHlDYWxsYmFjazogZnVuY3Rpb24gKGNhbGxiYWNrTmFtZSwgYXJncykge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICBzZWxmLl9xdWV1ZS5xdWV1ZVRhc2soZnVuY3Rpb24gKCkge1xuICAgICAgLy8gSWYgd2Ugc3RvcHBlZCBpbiB0aGUgbWVhbnRpbWUsIGRvIG5vdGhpbmcuXG4gICAgICBpZiAoIXNlbGYuX2hhbmRsZXMpXG4gICAgICAgIHJldHVybjtcblxuICAgICAgLy8gRmlyc3QsIGFwcGx5IHRoZSBjaGFuZ2UgdG8gdGhlIGNhY2hlLlxuICAgICAgc2VsZi5fY2FjaGUuYXBwbHlDaGFuZ2VbY2FsbGJhY2tOYW1lXS5hcHBseShudWxsLCBhcmdzKTtcblxuICAgICAgLy8gSWYgd2UgaGF2ZW4ndCBmaW5pc2hlZCB0aGUgaW5pdGlhbCBhZGRzLCB0aGVuIHdlIHNob3VsZCBvbmx5IGJlIGdldHRpbmdcbiAgICAgIC8vIGFkZHMuXG4gICAgICBpZiAoIXNlbGYuX3JlYWR5KCkgJiZcbiAgICAgICAgICAoY2FsbGJhY2tOYW1lICE9PSAnYWRkZWQnICYmIGNhbGxiYWNrTmFtZSAhPT0gJ2FkZGVkQmVmb3JlJykpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiR290IFwiICsgY2FsbGJhY2tOYW1lICsgXCIgZHVyaW5nIGluaXRpYWwgYWRkc1wiKTtcbiAgICAgIH1cblxuICAgICAgLy8gTm93IG11bHRpcGxleCB0aGUgY2FsbGJhY2tzIG91dCB0byBhbGwgb2JzZXJ2ZSBoYW5kbGVzLiBJdCdzIE9LIGlmXG4gICAgICAvLyB0aGVzZSBjYWxscyB5aWVsZDsgc2luY2Ugd2UncmUgaW5zaWRlIGEgdGFzaywgbm8gb3RoZXIgdXNlIG9mIG91ciBxdWV1ZVxuICAgICAgLy8gY2FuIGNvbnRpbnVlIHVudGlsIHRoZXNlIGFyZSBkb25lLiAoQnV0IHdlIGRvIGhhdmUgdG8gYmUgY2FyZWZ1bCB0byBub3RcbiAgICAgIC8vIHVzZSBhIGhhbmRsZSB0aGF0IGdvdCByZW1vdmVkLCBiZWNhdXNlIHJlbW92ZUhhbmRsZSBkb2VzIG5vdCB1c2UgdGhlXG4gICAgICAvLyBxdWV1ZTsgdGh1cywgd2UgaXRlcmF0ZSBvdmVyIGFuIGFycmF5IG9mIGtleXMgdGhhdCB3ZSBjb250cm9sLilcbiAgICAgIF8uZWFjaChfLmtleXMoc2VsZi5faGFuZGxlcyksIGZ1bmN0aW9uIChoYW5kbGVJZCkge1xuICAgICAgICB2YXIgaGFuZGxlID0gc2VsZi5faGFuZGxlcyAmJiBzZWxmLl9oYW5kbGVzW2hhbmRsZUlkXTtcbiAgICAgICAgaWYgKCFoYW5kbGUpXG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB2YXIgY2FsbGJhY2sgPSBoYW5kbGVbJ18nICsgY2FsbGJhY2tOYW1lXTtcbiAgICAgICAgLy8gY2xvbmUgYXJndW1lbnRzIHNvIHRoYXQgY2FsbGJhY2tzIGNhbiBtdXRhdGUgdGhlaXIgYXJndW1lbnRzXG4gICAgICAgIGNhbGxiYWNrICYmIGNhbGxiYWNrLmFwcGx5KG51bGwsXG4gICAgICAgICAgaGFuZGxlLm5vbk11dGF0aW5nQ2FsbGJhY2tzID8gYXJncyA6IEVKU09OLmNsb25lKGFyZ3MpKTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9LFxuXG4gIC8vIFNlbmRzIGluaXRpYWwgYWRkcyB0byBhIGhhbmRsZS4gSXQgc2hvdWxkIG9ubHkgYmUgY2FsbGVkIGZyb20gd2l0aGluIGEgdGFza1xuICAvLyAodGhlIHRhc2sgdGhhdCBpcyBwcm9jZXNzaW5nIHRoZSBhZGRIYW5kbGVBbmRTZW5kSW5pdGlhbEFkZHMgY2FsbCkuIEl0XG4gIC8vIHN5bmNocm9ub3VzbHkgaW52b2tlcyB0aGUgaGFuZGxlJ3MgYWRkZWQgb3IgYWRkZWRCZWZvcmU7IHRoZXJlJ3Mgbm8gbmVlZCB0b1xuICAvLyBmbHVzaCB0aGUgcXVldWUgYWZ0ZXJ3YXJkcyB0byBlbnN1cmUgdGhhdCB0aGUgY2FsbGJhY2tzIGdldCBvdXQuXG4gIF9zZW5kQWRkczogZnVuY3Rpb24gKGhhbmRsZSkge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICBpZiAoc2VsZi5fcXVldWUuc2FmZVRvUnVuVGFzaygpKVxuICAgICAgdGhyb3cgRXJyb3IoXCJfc2VuZEFkZHMgbWF5IG9ubHkgYmUgY2FsbGVkIGZyb20gd2l0aGluIGEgdGFzayFcIik7XG4gICAgdmFyIGFkZCA9IHNlbGYuX29yZGVyZWQgPyBoYW5kbGUuX2FkZGVkQmVmb3JlIDogaGFuZGxlLl9hZGRlZDtcbiAgICBpZiAoIWFkZClcbiAgICAgIHJldHVybjtcbiAgICAvLyBub3RlOiBkb2NzIG1heSBiZSBhbiBfSWRNYXAgb3IgYW4gT3JkZXJlZERpY3RcbiAgICBzZWxmLl9jYWNoZS5kb2NzLmZvckVhY2goZnVuY3Rpb24gKGRvYywgaWQpIHtcbiAgICAgIGlmICghXy5oYXMoc2VsZi5faGFuZGxlcywgaGFuZGxlLl9pZCkpXG4gICAgICAgIHRocm93IEVycm9yKFwiaGFuZGxlIGdvdCByZW1vdmVkIGJlZm9yZSBzZW5kaW5nIGluaXRpYWwgYWRkcyFcIik7XG4gICAgICBjb25zdCB7IF9pZCwgLi4uZmllbGRzIH0gPSBoYW5kbGUubm9uTXV0YXRpbmdDYWxsYmFja3MgPyBkb2NcbiAgICAgICAgOiBFSlNPTi5jbG9uZShkb2MpO1xuICAgICAgaWYgKHNlbGYuX29yZGVyZWQpXG4gICAgICAgIGFkZChpZCwgZmllbGRzLCBudWxsKTsgLy8gd2UncmUgZ29pbmcgaW4gb3JkZXIsIHNvIGFkZCBhdCBlbmRcbiAgICAgIGVsc2VcbiAgICAgICAgYWRkKGlkLCBmaWVsZHMpO1xuICAgIH0pO1xuICB9XG59KTtcblxuXG52YXIgbmV4dE9ic2VydmVIYW5kbGVJZCA9IDE7XG5cbi8vIFdoZW4gdGhlIGNhbGxiYWNrcyBkbyBub3QgbXV0YXRlIHRoZSBhcmd1bWVudHMsIHdlIGNhbiBza2lwIGEgbG90IG9mIGRhdGEgY2xvbmVzXG5PYnNlcnZlSGFuZGxlID0gZnVuY3Rpb24gKG11bHRpcGxleGVyLCBjYWxsYmFja3MsIG5vbk11dGF0aW5nQ2FsbGJhY2tzID0gZmFsc2UpIHtcbiAgdmFyIHNlbGYgPSB0aGlzO1xuICAvLyBUaGUgZW5kIHVzZXIgaXMgb25seSBzdXBwb3NlZCB0byBjYWxsIHN0b3AoKS4gIFRoZSBvdGhlciBmaWVsZHMgYXJlXG4gIC8vIGFjY2Vzc2libGUgdG8gdGhlIG11bHRpcGxleGVyLCB0aG91Z2guXG4gIHNlbGYuX211bHRpcGxleGVyID0gbXVsdGlwbGV4ZXI7XG4gIF8uZWFjaChtdWx0aXBsZXhlci5jYWxsYmFja05hbWVzKCksIGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgaWYgKGNhbGxiYWNrc1tuYW1lXSkge1xuICAgICAgc2VsZlsnXycgKyBuYW1lXSA9IGNhbGxiYWNrc1tuYW1lXTtcbiAgICB9IGVsc2UgaWYgKG5hbWUgPT09IFwiYWRkZWRCZWZvcmVcIiAmJiBjYWxsYmFja3MuYWRkZWQpIHtcbiAgICAgIC8vIFNwZWNpYWwgY2FzZTogaWYgeW91IHNwZWNpZnkgXCJhZGRlZFwiIGFuZCBcIm1vdmVkQmVmb3JlXCIsIHlvdSBnZXQgYW5cbiAgICAgIC8vIG9yZGVyZWQgb2JzZXJ2ZSB3aGVyZSBmb3Igc29tZSByZWFzb24geW91IGRvbid0IGdldCBvcmRlcmluZyBkYXRhIG9uXG4gICAgICAvLyB0aGUgYWRkcy4gIEkgZHVubm8sIHdlIHdyb3RlIHRlc3RzIGZvciBpdCwgdGhlcmUgbXVzdCBoYXZlIGJlZW4gYVxuICAgICAgLy8gcmVhc29uLlxuICAgICAgc2VsZi5fYWRkZWRCZWZvcmUgPSBmdW5jdGlvbiAoaWQsIGZpZWxkcywgYmVmb3JlKSB7XG4gICAgICAgIGNhbGxiYWNrcy5hZGRlZChpZCwgZmllbGRzKTtcbiAgICAgIH07XG4gICAgfVxuICB9KTtcbiAgc2VsZi5fc3RvcHBlZCA9IGZhbHNlO1xuICBzZWxmLl9pZCA9IG5leHRPYnNlcnZlSGFuZGxlSWQrKztcbiAgc2VsZi5ub25NdXRhdGluZ0NhbGxiYWNrcyA9IG5vbk11dGF0aW5nQ2FsbGJhY2tzO1xufTtcbk9ic2VydmVIYW5kbGUucHJvdG90eXBlLnN0b3AgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBzZWxmID0gdGhpcztcbiAgaWYgKHNlbGYuX3N0b3BwZWQpXG4gICAgcmV0dXJuO1xuICBzZWxmLl9zdG9wcGVkID0gdHJ1ZTtcbiAgc2VsZi5fbXVsdGlwbGV4ZXIucmVtb3ZlSGFuZGxlKHNlbGYuX2lkKTtcbn07XG4iLCJ2YXIgRmliZXIgPSBOcG0ucmVxdWlyZSgnZmliZXJzJyk7XG5cbmV4cG9ydCBjbGFzcyBEb2NGZXRjaGVyIHtcbiAgY29uc3RydWN0b3IobW9uZ29Db25uZWN0aW9uKSB7XG4gICAgdGhpcy5fbW9uZ29Db25uZWN0aW9uID0gbW9uZ29Db25uZWN0aW9uO1xuICAgIC8vIE1hcCBmcm9tIG9wIC0+IFtjYWxsYmFja11cbiAgICB0aGlzLl9jYWxsYmFja3NGb3JPcCA9IG5ldyBNYXA7XG4gIH1cblxuICAvLyBGZXRjaGVzIGRvY3VtZW50IFwiaWRcIiBmcm9tIGNvbGxlY3Rpb25OYW1lLCByZXR1cm5pbmcgaXQgb3IgbnVsbCBpZiBub3RcbiAgLy8gZm91bmQuXG4gIC8vXG4gIC8vIElmIHlvdSBtYWtlIG11bHRpcGxlIGNhbGxzIHRvIGZldGNoKCkgd2l0aCB0aGUgc2FtZSBvcCByZWZlcmVuY2UsXG4gIC8vIERvY0ZldGNoZXIgbWF5IGFzc3VtZSB0aGF0IHRoZXkgYWxsIHJldHVybiB0aGUgc2FtZSBkb2N1bWVudC4gKEl0IGRvZXNcbiAgLy8gbm90IGNoZWNrIHRvIHNlZSBpZiBjb2xsZWN0aW9uTmFtZS9pZCBtYXRjaC4pXG4gIC8vXG4gIC8vIFlvdSBtYXkgYXNzdW1lIHRoYXQgY2FsbGJhY2sgaXMgbmV2ZXIgY2FsbGVkIHN5bmNocm9ub3VzbHkgKGFuZCBpbiBmYWN0XG4gIC8vIE9wbG9nT2JzZXJ2ZURyaXZlciBkb2VzIHNvKS5cbiAgZmV0Y2goY29sbGVjdGlvbk5hbWUsIGlkLCBvcCwgY2FsbGJhY2spIHtcbiAgICBjb25zdCBzZWxmID0gdGhpcztcblxuICAgIFxuICAgIGNoZWNrKGNvbGxlY3Rpb25OYW1lLCBTdHJpbmcpO1xuICAgIGNoZWNrKG9wLCBPYmplY3QpO1xuXG5cbiAgICAvLyBJZiB0aGVyZSdzIGFscmVhZHkgYW4gaW4tcHJvZ3Jlc3MgZmV0Y2ggZm9yIHRoaXMgY2FjaGUga2V5LCB5aWVsZCB1bnRpbFxuICAgIC8vIGl0J3MgZG9uZSBhbmQgcmV0dXJuIHdoYXRldmVyIGl0IHJldHVybnMuXG4gICAgaWYgKHNlbGYuX2NhbGxiYWNrc0Zvck9wLmhhcyhvcCkpIHtcbiAgICAgIHNlbGYuX2NhbGxiYWNrc0Zvck9wLmdldChvcCkucHVzaChjYWxsYmFjayk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgY2FsbGJhY2tzID0gW2NhbGxiYWNrXTtcbiAgICBzZWxmLl9jYWxsYmFja3NGb3JPcC5zZXQob3AsIGNhbGxiYWNrcyk7XG5cbiAgICBGaWJlcihmdW5jdGlvbiAoKSB7XG4gICAgICB0cnkge1xuICAgICAgICB2YXIgZG9jID0gc2VsZi5fbW9uZ29Db25uZWN0aW9uLmZpbmRPbmUoXG4gICAgICAgICAgY29sbGVjdGlvbk5hbWUsIHtfaWQ6IGlkfSkgfHwgbnVsbDtcbiAgICAgICAgLy8gUmV0dXJuIGRvYyB0byBhbGwgcmVsZXZhbnQgY2FsbGJhY2tzLiBOb3RlIHRoYXQgdGhpcyBhcnJheSBjYW5cbiAgICAgICAgLy8gY29udGludWUgdG8gZ3JvdyBkdXJpbmcgY2FsbGJhY2sgZXhjZWN1dGlvbi5cbiAgICAgICAgd2hpbGUgKGNhbGxiYWNrcy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgLy8gQ2xvbmUgdGhlIGRvY3VtZW50IHNvIHRoYXQgdGhlIHZhcmlvdXMgY2FsbHMgdG8gZmV0Y2ggZG9uJ3QgcmV0dXJuXG4gICAgICAgICAgLy8gb2JqZWN0cyB0aGF0IGFyZSBpbnRlcnR3aW5nbGVkIHdpdGggZWFjaCBvdGhlci4gQ2xvbmUgYmVmb3JlXG4gICAgICAgICAgLy8gcG9wcGluZyB0aGUgZnV0dXJlLCBzbyB0aGF0IGlmIGNsb25lIHRocm93cywgdGhlIGVycm9yIGdldHMgcGFzc2VkXG4gICAgICAgICAgLy8gdG8gdGhlIG5leHQgY2FsbGJhY2suXG4gICAgICAgICAgY2FsbGJhY2tzLnBvcCgpKG51bGwsIEVKU09OLmNsb25lKGRvYykpO1xuICAgICAgICB9XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHdoaWxlIChjYWxsYmFja3MubGVuZ3RoID4gMCkge1xuICAgICAgICAgIGNhbGxiYWNrcy5wb3AoKShlKTtcbiAgICAgICAgfVxuICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgLy8gWFhYIGNvbnNpZGVyIGtlZXBpbmcgdGhlIGRvYyBhcm91bmQgZm9yIGEgcGVyaW9kIG9mIHRpbWUgYmVmb3JlXG4gICAgICAgIC8vIHJlbW92aW5nIGZyb20gdGhlIGNhY2hlXG4gICAgICAgIHNlbGYuX2NhbGxiYWNrc0Zvck9wLmRlbGV0ZShvcCk7XG4gICAgICB9XG4gICAgfSkucnVuKCk7XG4gIH1cbn1cbiIsInZhciBQT0xMSU5HX1RIUk9UVExFX01TID0gK3Byb2Nlc3MuZW52Lk1FVEVPUl9QT0xMSU5HX1RIUk9UVExFX01TIHx8IDUwO1xudmFyIFBPTExJTkdfSU5URVJWQUxfTVMgPSArcHJvY2Vzcy5lbnYuTUVURU9SX1BPTExJTkdfSU5URVJWQUxfTVMgfHwgMTAgKiAxMDAwO1xuXG5Qb2xsaW5nT2JzZXJ2ZURyaXZlciA9IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gIHZhciBzZWxmID0gdGhpcztcblxuICBzZWxmLl9jdXJzb3JEZXNjcmlwdGlvbiA9IG9wdGlvbnMuY3Vyc29yRGVzY3JpcHRpb247XG4gIHNlbGYuX21vbmdvSGFuZGxlID0gb3B0aW9ucy5tb25nb0hhbmRsZTtcbiAgc2VsZi5fb3JkZXJlZCA9IG9wdGlvbnMub3JkZXJlZDtcbiAgc2VsZi5fbXVsdGlwbGV4ZXIgPSBvcHRpb25zLm11bHRpcGxleGVyO1xuICBzZWxmLl9zdG9wQ2FsbGJhY2tzID0gW107XG4gIHNlbGYuX3N0b3BwZWQgPSBmYWxzZTtcblxuICBzZWxmLl9zeW5jaHJvbm91c0N1cnNvciA9IHNlbGYuX21vbmdvSGFuZGxlLl9jcmVhdGVTeW5jaHJvbm91c0N1cnNvcihcbiAgICBzZWxmLl9jdXJzb3JEZXNjcmlwdGlvbik7XG5cbiAgLy8gcHJldmlvdXMgcmVzdWx0cyBzbmFwc2hvdC4gIG9uIGVhY2ggcG9sbCBjeWNsZSwgZGlmZnMgYWdhaW5zdFxuICAvLyByZXN1bHRzIGRyaXZlcyB0aGUgY2FsbGJhY2tzLlxuICBzZWxmLl9yZXN1bHRzID0gbnVsbDtcblxuICAvLyBUaGUgbnVtYmVyIG9mIF9wb2xsTW9uZ28gY2FsbHMgdGhhdCBoYXZlIGJlZW4gYWRkZWQgdG8gc2VsZi5fdGFza1F1ZXVlIGJ1dFxuICAvLyBoYXZlIG5vdCBzdGFydGVkIHJ1bm5pbmcuIFVzZWQgdG8gbWFrZSBzdXJlIHdlIG5ldmVyIHNjaGVkdWxlIG1vcmUgdGhhbiBvbmVcbiAgLy8gX3BvbGxNb25nbyAob3RoZXIgdGhhbiBwb3NzaWJseSB0aGUgb25lIHRoYXQgaXMgY3VycmVudGx5IHJ1bm5pbmcpLiBJdCdzXG4gIC8vIGFsc28gdXNlZCBieSBfc3VzcGVuZFBvbGxpbmcgdG8gcHJldGVuZCB0aGVyZSdzIGEgcG9sbCBzY2hlZHVsZWQuIFVzdWFsbHksXG4gIC8vIGl0J3MgZWl0aGVyIDAgKGZvciBcIm5vIHBvbGxzIHNjaGVkdWxlZCBvdGhlciB0aGFuIG1heWJlIG9uZSBjdXJyZW50bHlcbiAgLy8gcnVubmluZ1wiKSBvciAxIChmb3IgXCJhIHBvbGwgc2NoZWR1bGVkIHRoYXQgaXNuJ3QgcnVubmluZyB5ZXRcIiksIGJ1dCBpdCBjYW5cbiAgLy8gYWxzbyBiZSAyIGlmIGluY3JlbWVudGVkIGJ5IF9zdXNwZW5kUG9sbGluZy5cbiAgc2VsZi5fcG9sbHNTY2hlZHVsZWRCdXROb3RTdGFydGVkID0gMDtcbiAgc2VsZi5fcGVuZGluZ1dyaXRlcyA9IFtdOyAvLyBwZW9wbGUgdG8gbm90aWZ5IHdoZW4gcG9sbGluZyBjb21wbGV0ZXNcblxuICAvLyBNYWtlIHN1cmUgdG8gY3JlYXRlIGEgc2VwYXJhdGVseSB0aHJvdHRsZWQgZnVuY3Rpb24gZm9yIGVhY2hcbiAgLy8gUG9sbGluZ09ic2VydmVEcml2ZXIgb2JqZWN0LlxuICBzZWxmLl9lbnN1cmVQb2xsSXNTY2hlZHVsZWQgPSBfLnRocm90dGxlKFxuICAgIHNlbGYuX3VudGhyb3R0bGVkRW5zdXJlUG9sbElzU2NoZWR1bGVkLFxuICAgIHNlbGYuX2N1cnNvckRlc2NyaXB0aW9uLm9wdGlvbnMucG9sbGluZ1Rocm90dGxlTXMgfHwgUE9MTElOR19USFJPVFRMRV9NUyAvKiBtcyAqLyk7XG5cbiAgLy8gWFhYIGZpZ3VyZSBvdXQgaWYgd2Ugc3RpbGwgbmVlZCBhIHF1ZXVlXG4gIHNlbGYuX3Rhc2tRdWV1ZSA9IG5ldyBNZXRlb3IuX1N5bmNocm9ub3VzUXVldWUoKTtcblxuICB2YXIgbGlzdGVuZXJzSGFuZGxlID0gbGlzdGVuQWxsKFxuICAgIHNlbGYuX2N1cnNvckRlc2NyaXB0aW9uLCBmdW5jdGlvbiAobm90aWZpY2F0aW9uKSB7XG4gICAgICAvLyBXaGVuIHNvbWVvbmUgZG9lcyBhIHRyYW5zYWN0aW9uIHRoYXQgbWlnaHQgYWZmZWN0IHVzLCBzY2hlZHVsZSBhIHBvbGxcbiAgICAgIC8vIG9mIHRoZSBkYXRhYmFzZS4gSWYgdGhhdCB0cmFuc2FjdGlvbiBoYXBwZW5zIGluc2lkZSBvZiBhIHdyaXRlIGZlbmNlLFxuICAgICAgLy8gYmxvY2sgdGhlIGZlbmNlIHVudGlsIHdlJ3ZlIHBvbGxlZCBhbmQgbm90aWZpZWQgb2JzZXJ2ZXJzLlxuICAgICAgdmFyIGZlbmNlID0gRERQU2VydmVyLl9DdXJyZW50V3JpdGVGZW5jZS5nZXQoKTtcbiAgICAgIGlmIChmZW5jZSlcbiAgICAgICAgc2VsZi5fcGVuZGluZ1dyaXRlcy5wdXNoKGZlbmNlLmJlZ2luV3JpdGUoKSk7XG4gICAgICAvLyBFbnN1cmUgYSBwb2xsIGlzIHNjaGVkdWxlZC4uLiBidXQgaWYgd2UgYWxyZWFkeSBrbm93IHRoYXQgb25lIGlzLFxuICAgICAgLy8gZG9uJ3QgaGl0IHRoZSB0aHJvdHRsZWQgX2Vuc3VyZVBvbGxJc1NjaGVkdWxlZCBmdW5jdGlvbiAod2hpY2ggbWlnaHRcbiAgICAgIC8vIGxlYWQgdG8gdXMgY2FsbGluZyBpdCB1bm5lY2Vzc2FyaWx5IGluIDxwb2xsaW5nVGhyb3R0bGVNcz4gbXMpLlxuICAgICAgaWYgKHNlbGYuX3BvbGxzU2NoZWR1bGVkQnV0Tm90U3RhcnRlZCA9PT0gMClcbiAgICAgICAgc2VsZi5fZW5zdXJlUG9sbElzU2NoZWR1bGVkKCk7XG4gICAgfVxuICApO1xuICBzZWxmLl9zdG9wQ2FsbGJhY2tzLnB1c2goZnVuY3Rpb24gKCkgeyBsaXN0ZW5lcnNIYW5kbGUuc3RvcCgpOyB9KTtcblxuICAvLyBldmVyeSBvbmNlIGFuZCBhIHdoaWxlLCBwb2xsIGV2ZW4gaWYgd2UgZG9uJ3QgdGhpbmsgd2UncmUgZGlydHksIGZvclxuICAvLyBldmVudHVhbCBjb25zaXN0ZW5jeSB3aXRoIGRhdGFiYXNlIHdyaXRlcyBmcm9tIG91dHNpZGUgdGhlIE1ldGVvclxuICAvLyB1bml2ZXJzZS5cbiAgLy9cbiAgLy8gRm9yIHRlc3RpbmcsIHRoZXJlJ3MgYW4gdW5kb2N1bWVudGVkIGNhbGxiYWNrIGFyZ3VtZW50IHRvIG9ic2VydmVDaGFuZ2VzXG4gIC8vIHdoaWNoIGRpc2FibGVzIHRpbWUtYmFzZWQgcG9sbGluZyBhbmQgZ2V0cyBjYWxsZWQgYXQgdGhlIGJlZ2lubmluZyBvZiBlYWNoXG4gIC8vIHBvbGwuXG4gIGlmIChvcHRpb25zLl90ZXN0T25seVBvbGxDYWxsYmFjaykge1xuICAgIHNlbGYuX3Rlc3RPbmx5UG9sbENhbGxiYWNrID0gb3B0aW9ucy5fdGVzdE9ubHlQb2xsQ2FsbGJhY2s7XG4gIH0gZWxzZSB7XG4gICAgdmFyIHBvbGxpbmdJbnRlcnZhbCA9XG4gICAgICAgICAgc2VsZi5fY3Vyc29yRGVzY3JpcHRpb24ub3B0aW9ucy5wb2xsaW5nSW50ZXJ2YWxNcyB8fFxuICAgICAgICAgIHNlbGYuX2N1cnNvckRlc2NyaXB0aW9uLm9wdGlvbnMuX3BvbGxpbmdJbnRlcnZhbCB8fCAvLyBDT01QQVQgd2l0aCAxLjJcbiAgICAgICAgICBQT0xMSU5HX0lOVEVSVkFMX01TO1xuICAgIHZhciBpbnRlcnZhbEhhbmRsZSA9IE1ldGVvci5zZXRJbnRlcnZhbChcbiAgICAgIF8uYmluZChzZWxmLl9lbnN1cmVQb2xsSXNTY2hlZHVsZWQsIHNlbGYpLCBwb2xsaW5nSW50ZXJ2YWwpO1xuICAgIHNlbGYuX3N0b3BDYWxsYmFja3MucHVzaChmdW5jdGlvbiAoKSB7XG4gICAgICBNZXRlb3IuY2xlYXJJbnRlcnZhbChpbnRlcnZhbEhhbmRsZSk7XG4gICAgfSk7XG4gIH1cblxuICAvLyBNYWtlIHN1cmUgd2UgYWN0dWFsbHkgcG9sbCBzb29uIVxuICBzZWxmLl91bnRocm90dGxlZEVuc3VyZVBvbGxJc1NjaGVkdWxlZCgpO1xuXG4gIFBhY2thZ2VbJ2ZhY3RzLWJhc2UnXSAmJiBQYWNrYWdlWydmYWN0cy1iYXNlJ10uRmFjdHMuaW5jcmVtZW50U2VydmVyRmFjdChcbiAgICBcIm1vbmdvLWxpdmVkYXRhXCIsIFwib2JzZXJ2ZS1kcml2ZXJzLXBvbGxpbmdcIiwgMSk7XG59O1xuXG5fLmV4dGVuZChQb2xsaW5nT2JzZXJ2ZURyaXZlci5wcm90b3R5cGUsIHtcbiAgLy8gVGhpcyBpcyBhbHdheXMgY2FsbGVkIHRocm91Z2ggXy50aHJvdHRsZSAoZXhjZXB0IG9uY2UgYXQgc3RhcnR1cCkuXG4gIF91bnRocm90dGxlZEVuc3VyZVBvbGxJc1NjaGVkdWxlZDogZnVuY3Rpb24gKCkge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICBpZiAoc2VsZi5fcG9sbHNTY2hlZHVsZWRCdXROb3RTdGFydGVkID4gMClcbiAgICAgIHJldHVybjtcbiAgICArK3NlbGYuX3BvbGxzU2NoZWR1bGVkQnV0Tm90U3RhcnRlZDtcbiAgICBzZWxmLl90YXNrUXVldWUucXVldWVUYXNrKGZ1bmN0aW9uICgpIHtcbiAgICAgIHNlbGYuX3BvbGxNb25nbygpO1xuICAgIH0pO1xuICB9LFxuXG4gIC8vIHRlc3Qtb25seSBpbnRlcmZhY2UgZm9yIGNvbnRyb2xsaW5nIHBvbGxpbmcuXG4gIC8vXG4gIC8vIF9zdXNwZW5kUG9sbGluZyBibG9ja3MgdW50aWwgYW55IGN1cnJlbnRseSBydW5uaW5nIGFuZCBzY2hlZHVsZWQgcG9sbHMgYXJlXG4gIC8vIGRvbmUsIGFuZCBwcmV2ZW50cyBhbnkgZnVydGhlciBwb2xscyBmcm9tIGJlaW5nIHNjaGVkdWxlZC4gKG5ld1xuICAvLyBPYnNlcnZlSGFuZGxlcyBjYW4gYmUgYWRkZWQgYW5kIHJlY2VpdmUgdGhlaXIgaW5pdGlhbCBhZGRlZCBjYWxsYmFja3MsXG4gIC8vIHRob3VnaC4pXG4gIC8vXG4gIC8vIF9yZXN1bWVQb2xsaW5nIGltbWVkaWF0ZWx5IHBvbGxzLCBhbmQgYWxsb3dzIGZ1cnRoZXIgcG9sbHMgdG8gb2NjdXIuXG4gIF9zdXNwZW5kUG9sbGluZzogZnVuY3Rpb24oKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIC8vIFByZXRlbmQgdGhhdCB0aGVyZSdzIGFub3RoZXIgcG9sbCBzY2hlZHVsZWQgKHdoaWNoIHdpbGwgcHJldmVudFxuICAgIC8vIF9lbnN1cmVQb2xsSXNTY2hlZHVsZWQgZnJvbSBxdWV1ZWluZyBhbnkgbW9yZSBwb2xscykuXG4gICAgKytzZWxmLl9wb2xsc1NjaGVkdWxlZEJ1dE5vdFN0YXJ0ZWQ7XG4gICAgLy8gTm93IGJsb2NrIHVudGlsIGFsbCBjdXJyZW50bHkgcnVubmluZyBvciBzY2hlZHVsZWQgcG9sbHMgYXJlIGRvbmUuXG4gICAgc2VsZi5fdGFza1F1ZXVlLnJ1blRhc2soZnVuY3Rpb24oKSB7fSk7XG5cbiAgICAvLyBDb25maXJtIHRoYXQgdGhlcmUgaXMgb25seSBvbmUgXCJwb2xsXCIgKHRoZSBmYWtlIG9uZSB3ZSdyZSBwcmV0ZW5kaW5nIHRvXG4gICAgLy8gaGF2ZSkgc2NoZWR1bGVkLlxuICAgIGlmIChzZWxmLl9wb2xsc1NjaGVkdWxlZEJ1dE5vdFN0YXJ0ZWQgIT09IDEpXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJfcG9sbHNTY2hlZHVsZWRCdXROb3RTdGFydGVkIGlzIFwiICtcbiAgICAgICAgICAgICAgICAgICAgICBzZWxmLl9wb2xsc1NjaGVkdWxlZEJ1dE5vdFN0YXJ0ZWQpO1xuICB9LFxuICBfcmVzdW1lUG9sbGluZzogZnVuY3Rpb24oKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIC8vIFdlIHNob3VsZCBiZSBpbiB0aGUgc2FtZSBzdGF0ZSBhcyBpbiB0aGUgZW5kIG9mIF9zdXNwZW5kUG9sbGluZy5cbiAgICBpZiAoc2VsZi5fcG9sbHNTY2hlZHVsZWRCdXROb3RTdGFydGVkICE9PSAxKVxuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiX3BvbGxzU2NoZWR1bGVkQnV0Tm90U3RhcnRlZCBpcyBcIiArXG4gICAgICAgICAgICAgICAgICAgICAgc2VsZi5fcG9sbHNTY2hlZHVsZWRCdXROb3RTdGFydGVkKTtcbiAgICAvLyBSdW4gYSBwb2xsIHN5bmNocm9ub3VzbHkgKHdoaWNoIHdpbGwgY291bnRlcmFjdCB0aGVcbiAgICAvLyArK19wb2xsc1NjaGVkdWxlZEJ1dE5vdFN0YXJ0ZWQgZnJvbSBfc3VzcGVuZFBvbGxpbmcpLlxuICAgIHNlbGYuX3Rhc2tRdWV1ZS5ydW5UYXNrKGZ1bmN0aW9uICgpIHtcbiAgICAgIHNlbGYuX3BvbGxNb25nbygpO1xuICAgIH0pO1xuICB9LFxuXG4gIF9wb2xsTW9uZ286IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgLS1zZWxmLl9wb2xsc1NjaGVkdWxlZEJ1dE5vdFN0YXJ0ZWQ7XG5cbiAgICBpZiAoc2VsZi5fc3RvcHBlZClcbiAgICAgIHJldHVybjtcblxuICAgIHZhciBmaXJzdCA9IGZhbHNlO1xuICAgIHZhciBuZXdSZXN1bHRzO1xuICAgIHZhciBvbGRSZXN1bHRzID0gc2VsZi5fcmVzdWx0cztcbiAgICBpZiAoIW9sZFJlc3VsdHMpIHtcbiAgICAgIGZpcnN0ID0gdHJ1ZTtcbiAgICAgIC8vIFhYWCBtYXliZSB1c2UgT3JkZXJlZERpY3QgaW5zdGVhZD9cbiAgICAgIG9sZFJlc3VsdHMgPSBzZWxmLl9vcmRlcmVkID8gW10gOiBuZXcgTG9jYWxDb2xsZWN0aW9uLl9JZE1hcDtcbiAgICB9XG5cbiAgICBzZWxmLl90ZXN0T25seVBvbGxDYWxsYmFjayAmJiBzZWxmLl90ZXN0T25seVBvbGxDYWxsYmFjaygpO1xuXG4gICAgLy8gU2F2ZSB0aGUgbGlzdCBvZiBwZW5kaW5nIHdyaXRlcyB3aGljaCB0aGlzIHJvdW5kIHdpbGwgY29tbWl0LlxuICAgIHZhciB3cml0ZXNGb3JDeWNsZSA9IHNlbGYuX3BlbmRpbmdXcml0ZXM7XG4gICAgc2VsZi5fcGVuZGluZ1dyaXRlcyA9IFtdO1xuXG4gICAgLy8gR2V0IHRoZSBuZXcgcXVlcnkgcmVzdWx0cy4gKFRoaXMgeWllbGRzLilcbiAgICB0cnkge1xuICAgICAgbmV3UmVzdWx0cyA9IHNlbGYuX3N5bmNocm9ub3VzQ3Vyc29yLmdldFJhd09iamVjdHMoc2VsZi5fb3JkZXJlZCk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgaWYgKGZpcnN0ICYmIHR5cGVvZihlLmNvZGUpID09PSAnbnVtYmVyJykge1xuICAgICAgICAvLyBUaGlzIGlzIGFuIGVycm9yIGRvY3VtZW50IHNlbnQgdG8gdXMgYnkgbW9uZ29kLCBub3QgYSBjb25uZWN0aW9uXG4gICAgICAgIC8vIGVycm9yIGdlbmVyYXRlZCBieSB0aGUgY2xpZW50LiBBbmQgd2UndmUgbmV2ZXIgc2VlbiB0aGlzIHF1ZXJ5IHdvcmtcbiAgICAgICAgLy8gc3VjY2Vzc2Z1bGx5LiBQcm9iYWJseSBpdCdzIGEgYmFkIHNlbGVjdG9yIG9yIHNvbWV0aGluZywgc28gd2Ugc2hvdWxkXG4gICAgICAgIC8vIE5PVCByZXRyeS4gSW5zdGVhZCwgd2Ugc2hvdWxkIGhhbHQgdGhlIG9ic2VydmUgKHdoaWNoIGVuZHMgdXAgY2FsbGluZ1xuICAgICAgICAvLyBgc3RvcGAgb24gdXMpLlxuICAgICAgICBzZWxmLl9tdWx0aXBsZXhlci5xdWVyeUVycm9yKFxuICAgICAgICAgIG5ldyBFcnJvcihcbiAgICAgICAgICAgIFwiRXhjZXB0aW9uIHdoaWxlIHBvbGxpbmcgcXVlcnkgXCIgK1xuICAgICAgICAgICAgICBKU09OLnN0cmluZ2lmeShzZWxmLl9jdXJzb3JEZXNjcmlwdGlvbikgKyBcIjogXCIgKyBlLm1lc3NhZ2UpKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICAvLyBnZXRSYXdPYmplY3RzIGNhbiB0aHJvdyBpZiB3ZSdyZSBoYXZpbmcgdHJvdWJsZSB0YWxraW5nIHRvIHRoZVxuICAgICAgLy8gZGF0YWJhc2UuICBUaGF0J3MgZmluZSAtLS0gd2Ugd2lsbCByZXBvbGwgbGF0ZXIgYW55d2F5LiBCdXQgd2Ugc2hvdWxkXG4gICAgICAvLyBtYWtlIHN1cmUgbm90IHRvIGxvc2UgdHJhY2sgb2YgdGhpcyBjeWNsZSdzIHdyaXRlcy5cbiAgICAgIC8vIChJdCBhbHNvIGNhbiB0aHJvdyBpZiB0aGVyZSdzIGp1c3Qgc29tZXRoaW5nIGludmFsaWQgYWJvdXQgdGhpcyBxdWVyeTtcbiAgICAgIC8vIHVuZm9ydHVuYXRlbHkgdGhlIE9ic2VydmVEcml2ZXIgQVBJIGRvZXNuJ3QgcHJvdmlkZSBhIGdvb2Qgd2F5IHRvXG4gICAgICAvLyBcImNhbmNlbFwiIHRoZSBvYnNlcnZlIGZyb20gdGhlIGluc2lkZSBpbiB0aGlzIGNhc2UuXG4gICAgICBBcnJheS5wcm90b3R5cGUucHVzaC5hcHBseShzZWxmLl9wZW5kaW5nV3JpdGVzLCB3cml0ZXNGb3JDeWNsZSk7XG4gICAgICBNZXRlb3IuX2RlYnVnKFwiRXhjZXB0aW9uIHdoaWxlIHBvbGxpbmcgcXVlcnkgXCIgK1xuICAgICAgICAgICAgICAgICAgICBKU09OLnN0cmluZ2lmeShzZWxmLl9jdXJzb3JEZXNjcmlwdGlvbiksIGUpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIFJ1biBkaWZmcy5cbiAgICBpZiAoIXNlbGYuX3N0b3BwZWQpIHtcbiAgICAgIExvY2FsQ29sbGVjdGlvbi5fZGlmZlF1ZXJ5Q2hhbmdlcyhcbiAgICAgICAgc2VsZi5fb3JkZXJlZCwgb2xkUmVzdWx0cywgbmV3UmVzdWx0cywgc2VsZi5fbXVsdGlwbGV4ZXIpO1xuICAgIH1cblxuICAgIC8vIFNpZ25hbHMgdGhlIG11bHRpcGxleGVyIHRvIGFsbG93IGFsbCBvYnNlcnZlQ2hhbmdlcyBjYWxscyB0aGF0IHNoYXJlIHRoaXNcbiAgICAvLyBtdWx0aXBsZXhlciB0byByZXR1cm4uIChUaGlzIGhhcHBlbnMgYXN5bmNocm9ub3VzbHksIHZpYSB0aGVcbiAgICAvLyBtdWx0aXBsZXhlcidzIHF1ZXVlLilcbiAgICBpZiAoZmlyc3QpXG4gICAgICBzZWxmLl9tdWx0aXBsZXhlci5yZWFkeSgpO1xuXG4gICAgLy8gUmVwbGFjZSBzZWxmLl9yZXN1bHRzIGF0b21pY2FsbHkuICAoVGhpcyBhc3NpZ25tZW50IGlzIHdoYXQgbWFrZXMgYGZpcnN0YFxuICAgIC8vIHN0YXkgdGhyb3VnaCBvbiB0aGUgbmV4dCBjeWNsZSwgc28gd2UndmUgd2FpdGVkIHVudGlsIGFmdGVyIHdlJ3ZlXG4gICAgLy8gY29tbWl0dGVkIHRvIHJlYWR5LWluZyB0aGUgbXVsdGlwbGV4ZXIuKVxuICAgIHNlbGYuX3Jlc3VsdHMgPSBuZXdSZXN1bHRzO1xuXG4gICAgLy8gT25jZSB0aGUgT2JzZXJ2ZU11bHRpcGxleGVyIGhhcyBwcm9jZXNzZWQgZXZlcnl0aGluZyB3ZSd2ZSBkb25lIGluIHRoaXNcbiAgICAvLyByb3VuZCwgbWFyayBhbGwgdGhlIHdyaXRlcyB3aGljaCBleGlzdGVkIGJlZm9yZSB0aGlzIGNhbGwgYXNcbiAgICAvLyBjb21tbWl0dGVkLiAoSWYgbmV3IHdyaXRlcyBoYXZlIHNob3duIHVwIGluIHRoZSBtZWFudGltZSwgdGhlcmUnbGxcbiAgICAvLyBhbHJlYWR5IGJlIGFub3RoZXIgX3BvbGxNb25nbyB0YXNrIHNjaGVkdWxlZC4pXG4gICAgc2VsZi5fbXVsdGlwbGV4ZXIub25GbHVzaChmdW5jdGlvbiAoKSB7XG4gICAgICBfLmVhY2god3JpdGVzRm9yQ3ljbGUsIGZ1bmN0aW9uICh3KSB7XG4gICAgICAgIHcuY29tbWl0dGVkKCk7XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfSxcblxuICBzdG9wOiBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIHNlbGYuX3N0b3BwZWQgPSB0cnVlO1xuICAgIF8uZWFjaChzZWxmLl9zdG9wQ2FsbGJhY2tzLCBmdW5jdGlvbiAoYykgeyBjKCk7IH0pO1xuICAgIC8vIFJlbGVhc2UgYW55IHdyaXRlIGZlbmNlcyB0aGF0IGFyZSB3YWl0aW5nIG9uIHVzLlxuICAgIF8uZWFjaChzZWxmLl9wZW5kaW5nV3JpdGVzLCBmdW5jdGlvbiAodykge1xuICAgICAgdy5jb21taXR0ZWQoKTtcbiAgICB9KTtcbiAgICBQYWNrYWdlWydmYWN0cy1iYXNlJ10gJiYgUGFja2FnZVsnZmFjdHMtYmFzZSddLkZhY3RzLmluY3JlbWVudFNlcnZlckZhY3QoXG4gICAgICBcIm1vbmdvLWxpdmVkYXRhXCIsIFwib2JzZXJ2ZS1kcml2ZXJzLXBvbGxpbmdcIiwgLTEpO1xuICB9XG59KTtcbiIsImltcG9ydCB7IG9wbG9nVjJWMUNvbnZlcnRlciB9IGZyb20gXCIuL29wbG9nX3YyX2NvbnZlcnRlclwiO1xuXG52YXIgRnV0dXJlID0gTnBtLnJlcXVpcmUoJ2ZpYmVycy9mdXR1cmUnKTtcblxudmFyIFBIQVNFID0ge1xuICBRVUVSWUlORzogXCJRVUVSWUlOR1wiLFxuICBGRVRDSElORzogXCJGRVRDSElOR1wiLFxuICBTVEVBRFk6IFwiU1RFQURZXCJcbn07XG5cbi8vIEV4Y2VwdGlvbiB0aHJvd24gYnkgX25lZWRUb1BvbGxRdWVyeSB3aGljaCB1bnJvbGxzIHRoZSBzdGFjayB1cCB0byB0aGVcbi8vIGVuY2xvc2luZyBjYWxsIHRvIGZpbmlzaElmTmVlZFRvUG9sbFF1ZXJ5LlxudmFyIFN3aXRjaGVkVG9RdWVyeSA9IGZ1bmN0aW9uICgpIHt9O1xudmFyIGZpbmlzaElmTmVlZFRvUG9sbFF1ZXJ5ID0gZnVuY3Rpb24gKGYpIHtcbiAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcbiAgICB0cnkge1xuICAgICAgZi5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGlmICghKGUgaW5zdGFuY2VvZiBTd2l0Y2hlZFRvUXVlcnkpKVxuICAgICAgICB0aHJvdyBlO1xuICAgIH1cbiAgfTtcbn07XG5cbnZhciBjdXJyZW50SWQgPSAwO1xuXG4vLyBPcGxvZ09ic2VydmVEcml2ZXIgaXMgYW4gYWx0ZXJuYXRpdmUgdG8gUG9sbGluZ09ic2VydmVEcml2ZXIgd2hpY2ggZm9sbG93c1xuLy8gdGhlIE1vbmdvIG9wZXJhdGlvbiBsb2cgaW5zdGVhZCBvZiBqdXN0IHJlLXBvbGxpbmcgdGhlIHF1ZXJ5LiBJdCBvYmV5cyB0aGVcbi8vIHNhbWUgc2ltcGxlIGludGVyZmFjZTogY29uc3RydWN0aW5nIGl0IHN0YXJ0cyBzZW5kaW5nIG9ic2VydmVDaGFuZ2VzXG4vLyBjYWxsYmFja3MgKGFuZCBhIHJlYWR5KCkgaW52b2NhdGlvbikgdG8gdGhlIE9ic2VydmVNdWx0aXBsZXhlciwgYW5kIHlvdSBzdG9wXG4vLyBpdCBieSBjYWxsaW5nIHRoZSBzdG9wKCkgbWV0aG9kLlxuT3Bsb2dPYnNlcnZlRHJpdmVyID0gZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgdmFyIHNlbGYgPSB0aGlzO1xuICBzZWxmLl91c2VzT3Bsb2cgPSB0cnVlOyAgLy8gdGVzdHMgbG9vayBhdCB0aGlzXG5cbiAgc2VsZi5faWQgPSBjdXJyZW50SWQ7XG4gIGN1cnJlbnRJZCsrO1xuXG4gIHNlbGYuX2N1cnNvckRlc2NyaXB0aW9uID0gb3B0aW9ucy5jdXJzb3JEZXNjcmlwdGlvbjtcbiAgc2VsZi5fbW9uZ29IYW5kbGUgPSBvcHRpb25zLm1vbmdvSGFuZGxlO1xuICBzZWxmLl9tdWx0aXBsZXhlciA9IG9wdGlvbnMubXVsdGlwbGV4ZXI7XG5cbiAgaWYgKG9wdGlvbnMub3JkZXJlZCkge1xuICAgIHRocm93IEVycm9yKFwiT3Bsb2dPYnNlcnZlRHJpdmVyIG9ubHkgc3VwcG9ydHMgdW5vcmRlcmVkIG9ic2VydmVDaGFuZ2VzXCIpO1xuICB9XG5cbiAgdmFyIHNvcnRlciA9IG9wdGlvbnMuc29ydGVyO1xuICAvLyBXZSBkb24ndCBzdXBwb3J0ICRuZWFyIGFuZCBvdGhlciBnZW8tcXVlcmllcyBzbyBpdCdzIE9LIHRvIGluaXRpYWxpemUgdGhlXG4gIC8vIGNvbXBhcmF0b3Igb25seSBvbmNlIGluIHRoZSBjb25zdHJ1Y3Rvci5cbiAgdmFyIGNvbXBhcmF0b3IgPSBzb3J0ZXIgJiYgc29ydGVyLmdldENvbXBhcmF0b3IoKTtcblxuICBpZiAob3B0aW9ucy5jdXJzb3JEZXNjcmlwdGlvbi5vcHRpb25zLmxpbWl0KSB7XG4gICAgLy8gVGhlcmUgYXJlIHNldmVyYWwgcHJvcGVydGllcyBvcmRlcmVkIGRyaXZlciBpbXBsZW1lbnRzOlxuICAgIC8vIC0gX2xpbWl0IGlzIGEgcG9zaXRpdmUgbnVtYmVyXG4gICAgLy8gLSBfY29tcGFyYXRvciBpcyBhIGZ1bmN0aW9uLWNvbXBhcmF0b3IgYnkgd2hpY2ggdGhlIHF1ZXJ5IGlzIG9yZGVyZWRcbiAgICAvLyAtIF91bnB1Ymxpc2hlZEJ1ZmZlciBpcyBub24tbnVsbCBNaW4vTWF4IEhlYXAsXG4gICAgLy8gICAgICAgICAgICAgICAgICAgICAgdGhlIGVtcHR5IGJ1ZmZlciBpbiBTVEVBRFkgcGhhc2UgaW1wbGllcyB0aGF0IHRoZVxuICAgIC8vICAgICAgICAgICAgICAgICAgICAgIGV2ZXJ5dGhpbmcgdGhhdCBtYXRjaGVzIHRoZSBxdWVyaWVzIHNlbGVjdG9yIGZpdHNcbiAgICAvLyAgICAgICAgICAgICAgICAgICAgICBpbnRvIHB1Ymxpc2hlZCBzZXQuXG4gICAgLy8gLSBfcHVibGlzaGVkIC0gTWF4IEhlYXAgKGFsc28gaW1wbGVtZW50cyBJZE1hcCBtZXRob2RzKVxuXG4gICAgdmFyIGhlYXBPcHRpb25zID0geyBJZE1hcDogTG9jYWxDb2xsZWN0aW9uLl9JZE1hcCB9O1xuICAgIHNlbGYuX2xpbWl0ID0gc2VsZi5fY3Vyc29yRGVzY3JpcHRpb24ub3B0aW9ucy5saW1pdDtcbiAgICBzZWxmLl9jb21wYXJhdG9yID0gY29tcGFyYXRvcjtcbiAgICBzZWxmLl9zb3J0ZXIgPSBzb3J0ZXI7XG4gICAgc2VsZi5fdW5wdWJsaXNoZWRCdWZmZXIgPSBuZXcgTWluTWF4SGVhcChjb21wYXJhdG9yLCBoZWFwT3B0aW9ucyk7XG4gICAgLy8gV2UgbmVlZCBzb21ldGhpbmcgdGhhdCBjYW4gZmluZCBNYXggdmFsdWUgaW4gYWRkaXRpb24gdG8gSWRNYXAgaW50ZXJmYWNlXG4gICAgc2VsZi5fcHVibGlzaGVkID0gbmV3IE1heEhlYXAoY29tcGFyYXRvciwgaGVhcE9wdGlvbnMpO1xuICB9IGVsc2Uge1xuICAgIHNlbGYuX2xpbWl0ID0gMDtcbiAgICBzZWxmLl9jb21wYXJhdG9yID0gbnVsbDtcbiAgICBzZWxmLl9zb3J0ZXIgPSBudWxsO1xuICAgIHNlbGYuX3VucHVibGlzaGVkQnVmZmVyID0gbnVsbDtcbiAgICBzZWxmLl9wdWJsaXNoZWQgPSBuZXcgTG9jYWxDb2xsZWN0aW9uLl9JZE1hcDtcbiAgfVxuXG4gIC8vIEluZGljYXRlcyBpZiBpdCBpcyBzYWZlIHRvIGluc2VydCBhIG5ldyBkb2N1bWVudCBhdCB0aGUgZW5kIG9mIHRoZSBidWZmZXJcbiAgLy8gZm9yIHRoaXMgcXVlcnkuIGkuZS4gaXQgaXMga25vd24gdGhhdCB0aGVyZSBhcmUgbm8gZG9jdW1lbnRzIG1hdGNoaW5nIHRoZVxuICAvLyBzZWxlY3RvciB0aG9zZSBhcmUgbm90IGluIHB1Ymxpc2hlZCBvciBidWZmZXIuXG4gIHNlbGYuX3NhZmVBcHBlbmRUb0J1ZmZlciA9IGZhbHNlO1xuXG4gIHNlbGYuX3N0b3BwZWQgPSBmYWxzZTtcbiAgc2VsZi5fc3RvcEhhbmRsZXMgPSBbXTtcblxuICBQYWNrYWdlWydmYWN0cy1iYXNlJ10gJiYgUGFja2FnZVsnZmFjdHMtYmFzZSddLkZhY3RzLmluY3JlbWVudFNlcnZlckZhY3QoXG4gICAgXCJtb25nby1saXZlZGF0YVwiLCBcIm9ic2VydmUtZHJpdmVycy1vcGxvZ1wiLCAxKTtcblxuICBzZWxmLl9yZWdpc3RlclBoYXNlQ2hhbmdlKFBIQVNFLlFVRVJZSU5HKTtcblxuICBzZWxmLl9tYXRjaGVyID0gb3B0aW9ucy5tYXRjaGVyO1xuICAvLyB3ZSBhcmUgbm93IHVzaW5nIHByb2plY3Rpb24sIG5vdCBmaWVsZHMgaW4gdGhlIGN1cnNvciBkZXNjcmlwdGlvbiBldmVuIGlmIHlvdSBwYXNzIHtmaWVsZHN9XG4gIC8vIGluIHRoZSBjdXJzb3IgY29uc3RydWN0aW9uXG4gIHZhciBwcm9qZWN0aW9uID0gc2VsZi5fY3Vyc29yRGVzY3JpcHRpb24ub3B0aW9ucy5maWVsZHMgfHwgc2VsZi5fY3Vyc29yRGVzY3JpcHRpb24ub3B0aW9ucy5wcm9qZWN0aW9uIHx8IHt9O1xuICBzZWxmLl9wcm9qZWN0aW9uRm4gPSBMb2NhbENvbGxlY3Rpb24uX2NvbXBpbGVQcm9qZWN0aW9uKHByb2plY3Rpb24pO1xuICAvLyBQcm9qZWN0aW9uIGZ1bmN0aW9uLCByZXN1bHQgb2YgY29tYmluaW5nIGltcG9ydGFudCBmaWVsZHMgZm9yIHNlbGVjdG9yIGFuZFxuICAvLyBleGlzdGluZyBmaWVsZHMgcHJvamVjdGlvblxuICBzZWxmLl9zaGFyZWRQcm9qZWN0aW9uID0gc2VsZi5fbWF0Y2hlci5jb21iaW5lSW50b1Byb2plY3Rpb24ocHJvamVjdGlvbik7XG4gIGlmIChzb3J0ZXIpXG4gICAgc2VsZi5fc2hhcmVkUHJvamVjdGlvbiA9IHNvcnRlci5jb21iaW5lSW50b1Byb2plY3Rpb24oc2VsZi5fc2hhcmVkUHJvamVjdGlvbik7XG4gIHNlbGYuX3NoYXJlZFByb2plY3Rpb25GbiA9IExvY2FsQ29sbGVjdGlvbi5fY29tcGlsZVByb2plY3Rpb24oXG4gICAgc2VsZi5fc2hhcmVkUHJvamVjdGlvbik7XG5cbiAgc2VsZi5fbmVlZFRvRmV0Y2ggPSBuZXcgTG9jYWxDb2xsZWN0aW9uLl9JZE1hcDtcbiAgc2VsZi5fY3VycmVudGx5RmV0Y2hpbmcgPSBudWxsO1xuICBzZWxmLl9mZXRjaEdlbmVyYXRpb24gPSAwO1xuXG4gIHNlbGYuX3JlcXVlcnlXaGVuRG9uZVRoaXNRdWVyeSA9IGZhbHNlO1xuICBzZWxmLl93cml0ZXNUb0NvbW1pdFdoZW5XZVJlYWNoU3RlYWR5ID0gW107XG5cbiAgLy8gSWYgdGhlIG9wbG9nIGhhbmRsZSB0ZWxscyB1cyB0aGF0IGl0IHNraXBwZWQgc29tZSBlbnRyaWVzIChiZWNhdXNlIGl0IGdvdFxuICAvLyBiZWhpbmQsIHNheSksIHJlLXBvbGwuXG4gIHNlbGYuX3N0b3BIYW5kbGVzLnB1c2goc2VsZi5fbW9uZ29IYW5kbGUuX29wbG9nSGFuZGxlLm9uU2tpcHBlZEVudHJpZXMoXG4gICAgZmluaXNoSWZOZWVkVG9Qb2xsUXVlcnkoZnVuY3Rpb24gKCkge1xuICAgICAgc2VsZi5fbmVlZFRvUG9sbFF1ZXJ5KCk7XG4gICAgfSlcbiAgKSk7XG5cbiAgZm9yRWFjaFRyaWdnZXIoc2VsZi5fY3Vyc29yRGVzY3JpcHRpb24sIGZ1bmN0aW9uICh0cmlnZ2VyKSB7XG4gICAgc2VsZi5fc3RvcEhhbmRsZXMucHVzaChzZWxmLl9tb25nb0hhbmRsZS5fb3Bsb2dIYW5kbGUub25PcGxvZ0VudHJ5KFxuICAgICAgdHJpZ2dlciwgZnVuY3Rpb24gKG5vdGlmaWNhdGlvbikge1xuICAgICAgICBNZXRlb3IuX25vWWllbGRzQWxsb3dlZChmaW5pc2hJZk5lZWRUb1BvbGxRdWVyeShmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgdmFyIG9wID0gbm90aWZpY2F0aW9uLm9wO1xuICAgICAgICAgIGlmIChub3RpZmljYXRpb24uZHJvcENvbGxlY3Rpb24gfHwgbm90aWZpY2F0aW9uLmRyb3BEYXRhYmFzZSkge1xuICAgICAgICAgICAgLy8gTm90ZTogdGhpcyBjYWxsIGlzIG5vdCBhbGxvd2VkIHRvIGJsb2NrIG9uIGFueXRoaW5nIChlc3BlY2lhbGx5XG4gICAgICAgICAgICAvLyBvbiB3YWl0aW5nIGZvciBvcGxvZyBlbnRyaWVzIHRvIGNhdGNoIHVwKSBiZWNhdXNlIHRoYXQgd2lsbCBibG9ja1xuICAgICAgICAgICAgLy8gb25PcGxvZ0VudHJ5IVxuICAgICAgICAgICAgc2VsZi5fbmVlZFRvUG9sbFF1ZXJ5KCk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIEFsbCBvdGhlciBvcGVyYXRvcnMgc2hvdWxkIGJlIGhhbmRsZWQgZGVwZW5kaW5nIG9uIHBoYXNlXG4gICAgICAgICAgICBpZiAoc2VsZi5fcGhhc2UgPT09IFBIQVNFLlFVRVJZSU5HKSB7XG4gICAgICAgICAgICAgIHNlbGYuX2hhbmRsZU9wbG9nRW50cnlRdWVyeWluZyhvcCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBzZWxmLl9oYW5kbGVPcGxvZ0VudHJ5U3RlYWR5T3JGZXRjaGluZyhvcCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9KSk7XG4gICAgICB9XG4gICAgKSk7XG4gIH0pO1xuXG4gIC8vIFhYWCBvcmRlcmluZyB3LnIudC4gZXZlcnl0aGluZyBlbHNlP1xuICBzZWxmLl9zdG9wSGFuZGxlcy5wdXNoKGxpc3RlbkFsbChcbiAgICBzZWxmLl9jdXJzb3JEZXNjcmlwdGlvbiwgZnVuY3Rpb24gKG5vdGlmaWNhdGlvbikge1xuICAgICAgLy8gSWYgd2UncmUgbm90IGluIGEgcHJlLWZpcmUgd3JpdGUgZmVuY2UsIHdlIGRvbid0IGhhdmUgdG8gZG8gYW55dGhpbmcuXG4gICAgICB2YXIgZmVuY2UgPSBERFBTZXJ2ZXIuX0N1cnJlbnRXcml0ZUZlbmNlLmdldCgpO1xuICAgICAgaWYgKCFmZW5jZSB8fCBmZW5jZS5maXJlZClcbiAgICAgICAgcmV0dXJuO1xuXG4gICAgICBpZiAoZmVuY2UuX29wbG9nT2JzZXJ2ZURyaXZlcnMpIHtcbiAgICAgICAgZmVuY2UuX29wbG9nT2JzZXJ2ZURyaXZlcnNbc2VsZi5faWRdID0gc2VsZjtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBmZW5jZS5fb3Bsb2dPYnNlcnZlRHJpdmVycyA9IHt9O1xuICAgICAgZmVuY2UuX29wbG9nT2JzZXJ2ZURyaXZlcnNbc2VsZi5faWRdID0gc2VsZjtcblxuICAgICAgZmVuY2Uub25CZWZvcmVGaXJlKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIGRyaXZlcnMgPSBmZW5jZS5fb3Bsb2dPYnNlcnZlRHJpdmVycztcbiAgICAgICAgZGVsZXRlIGZlbmNlLl9vcGxvZ09ic2VydmVEcml2ZXJzO1xuXG4gICAgICAgIC8vIFRoaXMgZmVuY2UgY2Fubm90IGZpcmUgdW50aWwgd2UndmUgY2F1Z2h0IHVwIHRvIFwidGhpcyBwb2ludFwiIGluIHRoZVxuICAgICAgICAvLyBvcGxvZywgYW5kIGFsbCBvYnNlcnZlcnMgbWFkZSBpdCBiYWNrIHRvIHRoZSBzdGVhZHkgc3RhdGUuXG4gICAgICAgIHNlbGYuX21vbmdvSGFuZGxlLl9vcGxvZ0hhbmRsZS53YWl0VW50aWxDYXVnaHRVcCgpO1xuXG4gICAgICAgIF8uZWFjaChkcml2ZXJzLCBmdW5jdGlvbiAoZHJpdmVyKSB7XG4gICAgICAgICAgaWYgKGRyaXZlci5fc3RvcHBlZClcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICAgIHZhciB3cml0ZSA9IGZlbmNlLmJlZ2luV3JpdGUoKTtcbiAgICAgICAgICBpZiAoZHJpdmVyLl9waGFzZSA9PT0gUEhBU0UuU1RFQURZKSB7XG4gICAgICAgICAgICAvLyBNYWtlIHN1cmUgdGhhdCBhbGwgb2YgdGhlIGNhbGxiYWNrcyBoYXZlIG1hZGUgaXQgdGhyb3VnaCB0aGVcbiAgICAgICAgICAgIC8vIG11bHRpcGxleGVyIGFuZCBiZWVuIGRlbGl2ZXJlZCB0byBPYnNlcnZlSGFuZGxlcyBiZWZvcmUgY29tbWl0dGluZ1xuICAgICAgICAgICAgLy8gd3JpdGVzLlxuICAgICAgICAgICAgZHJpdmVyLl9tdWx0aXBsZXhlci5vbkZsdXNoKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgd3JpdGUuY29tbWl0dGVkKCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZHJpdmVyLl93cml0ZXNUb0NvbW1pdFdoZW5XZVJlYWNoU3RlYWR5LnB1c2god3JpdGUpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgICB9XG4gICkpO1xuXG4gIC8vIFdoZW4gTW9uZ28gZmFpbHMgb3Zlciwgd2UgbmVlZCB0byByZXBvbGwgdGhlIHF1ZXJ5LCBpbiBjYXNlIHdlIHByb2Nlc3NlZCBhblxuICAvLyBvcGxvZyBlbnRyeSB0aGF0IGdvdCByb2xsZWQgYmFjay5cbiAgc2VsZi5fc3RvcEhhbmRsZXMucHVzaChzZWxmLl9tb25nb0hhbmRsZS5fb25GYWlsb3ZlcihmaW5pc2hJZk5lZWRUb1BvbGxRdWVyeShcbiAgICBmdW5jdGlvbiAoKSB7XG4gICAgICBzZWxmLl9uZWVkVG9Qb2xsUXVlcnkoKTtcbiAgICB9KSkpO1xuXG4gIC8vIEdpdmUgX29ic2VydmVDaGFuZ2VzIGEgY2hhbmNlIHRvIGFkZCB0aGUgbmV3IE9ic2VydmVIYW5kbGUgdG8gb3VyXG4gIC8vIG11bHRpcGxleGVyLCBzbyB0aGF0IHRoZSBhZGRlZCBjYWxscyBnZXQgc3RyZWFtZWQuXG4gIE1ldGVvci5kZWZlcihmaW5pc2hJZk5lZWRUb1BvbGxRdWVyeShmdW5jdGlvbiAoKSB7XG4gICAgc2VsZi5fcnVuSW5pdGlhbFF1ZXJ5KCk7XG4gIH0pKTtcbn07XG5cbl8uZXh0ZW5kKE9wbG9nT2JzZXJ2ZURyaXZlci5wcm90b3R5cGUsIHtcbiAgX2FkZFB1Ymxpc2hlZDogZnVuY3Rpb24gKGlkLCBkb2MpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgTWV0ZW9yLl9ub1lpZWxkc0FsbG93ZWQoZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIGZpZWxkcyA9IF8uY2xvbmUoZG9jKTtcbiAgICAgIGRlbGV0ZSBmaWVsZHMuX2lkO1xuICAgICAgc2VsZi5fcHVibGlzaGVkLnNldChpZCwgc2VsZi5fc2hhcmVkUHJvamVjdGlvbkZuKGRvYykpO1xuICAgICAgc2VsZi5fbXVsdGlwbGV4ZXIuYWRkZWQoaWQsIHNlbGYuX3Byb2plY3Rpb25GbihmaWVsZHMpKTtcblxuICAgICAgLy8gQWZ0ZXIgYWRkaW5nIHRoaXMgZG9jdW1lbnQsIHRoZSBwdWJsaXNoZWQgc2V0IG1pZ2h0IGJlIG92ZXJmbG93ZWRcbiAgICAgIC8vIChleGNlZWRpbmcgY2FwYWNpdHkgc3BlY2lmaWVkIGJ5IGxpbWl0KS4gSWYgc28sIHB1c2ggdGhlIG1heGltdW1cbiAgICAgIC8vIGVsZW1lbnQgdG8gdGhlIGJ1ZmZlciwgd2UgbWlnaHQgd2FudCB0byBzYXZlIGl0IGluIG1lbW9yeSB0byByZWR1Y2UgdGhlXG4gICAgICAvLyBhbW91bnQgb2YgTW9uZ28gbG9va3VwcyBpbiB0aGUgZnV0dXJlLlxuICAgICAgaWYgKHNlbGYuX2xpbWl0ICYmIHNlbGYuX3B1Ymxpc2hlZC5zaXplKCkgPiBzZWxmLl9saW1pdCkge1xuICAgICAgICAvLyBYWFggaW4gdGhlb3J5IHRoZSBzaXplIG9mIHB1Ymxpc2hlZCBpcyBubyBtb3JlIHRoYW4gbGltaXQrMVxuICAgICAgICBpZiAoc2VsZi5fcHVibGlzaGVkLnNpemUoKSAhPT0gc2VsZi5fbGltaXQgKyAxKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiQWZ0ZXIgYWRkaW5nIHRvIHB1Ymxpc2hlZCwgXCIgK1xuICAgICAgICAgICAgICAgICAgICAgICAgICAoc2VsZi5fcHVibGlzaGVkLnNpemUoKSAtIHNlbGYuX2xpbWl0KSArXG4gICAgICAgICAgICAgICAgICAgICAgICAgIFwiIGRvY3VtZW50cyBhcmUgb3ZlcmZsb3dpbmcgdGhlIHNldFwiKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBvdmVyZmxvd2luZ0RvY0lkID0gc2VsZi5fcHVibGlzaGVkLm1heEVsZW1lbnRJZCgpO1xuICAgICAgICB2YXIgb3ZlcmZsb3dpbmdEb2MgPSBzZWxmLl9wdWJsaXNoZWQuZ2V0KG92ZXJmbG93aW5nRG9jSWQpO1xuXG4gICAgICAgIGlmIChFSlNPTi5lcXVhbHMob3ZlcmZsb3dpbmdEb2NJZCwgaWQpKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiVGhlIGRvY3VtZW50IGp1c3QgYWRkZWQgaXMgb3ZlcmZsb3dpbmcgdGhlIHB1Ymxpc2hlZCBzZXRcIik7XG4gICAgICAgIH1cblxuICAgICAgICBzZWxmLl9wdWJsaXNoZWQucmVtb3ZlKG92ZXJmbG93aW5nRG9jSWQpO1xuICAgICAgICBzZWxmLl9tdWx0aXBsZXhlci5yZW1vdmVkKG92ZXJmbG93aW5nRG9jSWQpO1xuICAgICAgICBzZWxmLl9hZGRCdWZmZXJlZChvdmVyZmxvd2luZ0RvY0lkLCBvdmVyZmxvd2luZ0RvYyk7XG4gICAgICB9XG4gICAgfSk7XG4gIH0sXG4gIF9yZW1vdmVQdWJsaXNoZWQ6IGZ1bmN0aW9uIChpZCkge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICBNZXRlb3IuX25vWWllbGRzQWxsb3dlZChmdW5jdGlvbiAoKSB7XG4gICAgICBzZWxmLl9wdWJsaXNoZWQucmVtb3ZlKGlkKTtcbiAgICAgIHNlbGYuX211bHRpcGxleGVyLnJlbW92ZWQoaWQpO1xuICAgICAgaWYgKCEgc2VsZi5fbGltaXQgfHwgc2VsZi5fcHVibGlzaGVkLnNpemUoKSA9PT0gc2VsZi5fbGltaXQpXG4gICAgICAgIHJldHVybjtcblxuICAgICAgaWYgKHNlbGYuX3B1Ymxpc2hlZC5zaXplKCkgPiBzZWxmLl9saW1pdClcbiAgICAgICAgdGhyb3cgRXJyb3IoXCJzZWxmLl9wdWJsaXNoZWQgZ290IHRvbyBiaWdcIik7XG5cbiAgICAgIC8vIE9LLCB3ZSBhcmUgcHVibGlzaGluZyBsZXNzIHRoYW4gdGhlIGxpbWl0LiBNYXliZSB3ZSBzaG91bGQgbG9vayBpbiB0aGVcbiAgICAgIC8vIGJ1ZmZlciB0byBmaW5kIHRoZSBuZXh0IGVsZW1lbnQgcGFzdCB3aGF0IHdlIHdlcmUgcHVibGlzaGluZyBiZWZvcmUuXG5cbiAgICAgIGlmICghc2VsZi5fdW5wdWJsaXNoZWRCdWZmZXIuZW1wdHkoKSkge1xuICAgICAgICAvLyBUaGVyZSdzIHNvbWV0aGluZyBpbiB0aGUgYnVmZmVyOyBtb3ZlIHRoZSBmaXJzdCB0aGluZyBpbiBpdCB0b1xuICAgICAgICAvLyBfcHVibGlzaGVkLlxuICAgICAgICB2YXIgbmV3RG9jSWQgPSBzZWxmLl91bnB1Ymxpc2hlZEJ1ZmZlci5taW5FbGVtZW50SWQoKTtcbiAgICAgICAgdmFyIG5ld0RvYyA9IHNlbGYuX3VucHVibGlzaGVkQnVmZmVyLmdldChuZXdEb2NJZCk7XG4gICAgICAgIHNlbGYuX3JlbW92ZUJ1ZmZlcmVkKG5ld0RvY0lkKTtcbiAgICAgICAgc2VsZi5fYWRkUHVibGlzaGVkKG5ld0RvY0lkLCBuZXdEb2MpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIC8vIFRoZXJlJ3Mgbm90aGluZyBpbiB0aGUgYnVmZmVyLiAgVGhpcyBjb3VsZCBtZWFuIG9uZSBvZiBhIGZldyB0aGluZ3MuXG5cbiAgICAgIC8vIChhKSBXZSBjb3VsZCBiZSBpbiB0aGUgbWlkZGxlIG9mIHJlLXJ1bm5pbmcgdGhlIHF1ZXJ5IChzcGVjaWZpY2FsbHksIHdlXG4gICAgICAvLyBjb3VsZCBiZSBpbiBfcHVibGlzaE5ld1Jlc3VsdHMpLiBJbiB0aGF0IGNhc2UsIF91bnB1Ymxpc2hlZEJ1ZmZlciBpc1xuICAgICAgLy8gZW1wdHkgYmVjYXVzZSB3ZSBjbGVhciBpdCBhdCB0aGUgYmVnaW5uaW5nIG9mIF9wdWJsaXNoTmV3UmVzdWx0cy4gSW5cbiAgICAgIC8vIHRoaXMgY2FzZSwgb3VyIGNhbGxlciBhbHJlYWR5IGtub3dzIHRoZSBlbnRpcmUgYW5zd2VyIHRvIHRoZSBxdWVyeSBhbmRcbiAgICAgIC8vIHdlIGRvbid0IG5lZWQgdG8gZG8gYW55dGhpbmcgZmFuY3kgaGVyZS4gIEp1c3QgcmV0dXJuLlxuICAgICAgaWYgKHNlbGYuX3BoYXNlID09PSBQSEFTRS5RVUVSWUlORylcbiAgICAgICAgcmV0dXJuO1xuXG4gICAgICAvLyAoYikgV2UncmUgcHJldHR5IGNvbmZpZGVudCB0aGF0IHRoZSB1bmlvbiBvZiBfcHVibGlzaGVkIGFuZFxuICAgICAgLy8gX3VucHVibGlzaGVkQnVmZmVyIGNvbnRhaW4gYWxsIGRvY3VtZW50cyB0aGF0IG1hdGNoIHNlbGVjdG9yLiBCZWNhdXNlXG4gICAgICAvLyBfdW5wdWJsaXNoZWRCdWZmZXIgaXMgZW1wdHksIHRoYXQgbWVhbnMgd2UncmUgY29uZmlkZW50IHRoYXQgX3B1Ymxpc2hlZFxuICAgICAgLy8gY29udGFpbnMgYWxsIGRvY3VtZW50cyB0aGF0IG1hdGNoIHNlbGVjdG9yLiBTbyB3ZSBoYXZlIG5vdGhpbmcgdG8gZG8uXG4gICAgICBpZiAoc2VsZi5fc2FmZUFwcGVuZFRvQnVmZmVyKVxuICAgICAgICByZXR1cm47XG5cbiAgICAgIC8vIChjKSBNYXliZSB0aGVyZSBhcmUgb3RoZXIgZG9jdW1lbnRzIG91dCB0aGVyZSB0aGF0IHNob3VsZCBiZSBpbiBvdXJcbiAgICAgIC8vIGJ1ZmZlci4gQnV0IGluIHRoYXQgY2FzZSwgd2hlbiB3ZSBlbXB0aWVkIF91bnB1Ymxpc2hlZEJ1ZmZlciBpblxuICAgICAgLy8gX3JlbW92ZUJ1ZmZlcmVkLCB3ZSBzaG91bGQgaGF2ZSBjYWxsZWQgX25lZWRUb1BvbGxRdWVyeSwgd2hpY2ggd2lsbFxuICAgICAgLy8gZWl0aGVyIHB1dCBzb21ldGhpbmcgaW4gX3VucHVibGlzaGVkQnVmZmVyIG9yIHNldCBfc2FmZUFwcGVuZFRvQnVmZmVyXG4gICAgICAvLyAob3IgYm90aCksIGFuZCBpdCB3aWxsIHB1dCB1cyBpbiBRVUVSWUlORyBmb3IgdGhhdCB3aG9sZSB0aW1lLiBTbyBpblxuICAgICAgLy8gZmFjdCwgd2Ugc2hvdWxkbid0IGJlIGFibGUgdG8gZ2V0IGhlcmUuXG5cbiAgICAgIHRocm93IG5ldyBFcnJvcihcIkJ1ZmZlciBpbmV4cGxpY2FibHkgZW1wdHlcIik7XG4gICAgfSk7XG4gIH0sXG4gIF9jaGFuZ2VQdWJsaXNoZWQ6IGZ1bmN0aW9uIChpZCwgb2xkRG9jLCBuZXdEb2MpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgTWV0ZW9yLl9ub1lpZWxkc0FsbG93ZWQoZnVuY3Rpb24gKCkge1xuICAgICAgc2VsZi5fcHVibGlzaGVkLnNldChpZCwgc2VsZi5fc2hhcmVkUHJvamVjdGlvbkZuKG5ld0RvYykpO1xuICAgICAgdmFyIHByb2plY3RlZE5ldyA9IHNlbGYuX3Byb2plY3Rpb25GbihuZXdEb2MpO1xuICAgICAgdmFyIHByb2plY3RlZE9sZCA9IHNlbGYuX3Byb2plY3Rpb25GbihvbGREb2MpO1xuICAgICAgdmFyIGNoYW5nZWQgPSBEaWZmU2VxdWVuY2UubWFrZUNoYW5nZWRGaWVsZHMoXG4gICAgICAgIHByb2plY3RlZE5ldywgcHJvamVjdGVkT2xkKTtcbiAgICAgIGlmICghXy5pc0VtcHR5KGNoYW5nZWQpKVxuICAgICAgICBzZWxmLl9tdWx0aXBsZXhlci5jaGFuZ2VkKGlkLCBjaGFuZ2VkKTtcbiAgICB9KTtcbiAgfSxcbiAgX2FkZEJ1ZmZlcmVkOiBmdW5jdGlvbiAoaWQsIGRvYykge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICBNZXRlb3IuX25vWWllbGRzQWxsb3dlZChmdW5jdGlvbiAoKSB7XG4gICAgICBzZWxmLl91bnB1Ymxpc2hlZEJ1ZmZlci5zZXQoaWQsIHNlbGYuX3NoYXJlZFByb2plY3Rpb25Gbihkb2MpKTtcblxuICAgICAgLy8gSWYgc29tZXRoaW5nIGlzIG92ZXJmbG93aW5nIHRoZSBidWZmZXIsIHdlIGp1c3QgcmVtb3ZlIGl0IGZyb20gY2FjaGVcbiAgICAgIGlmIChzZWxmLl91bnB1Ymxpc2hlZEJ1ZmZlci5zaXplKCkgPiBzZWxmLl9saW1pdCkge1xuICAgICAgICB2YXIgbWF4QnVmZmVyZWRJZCA9IHNlbGYuX3VucHVibGlzaGVkQnVmZmVyLm1heEVsZW1lbnRJZCgpO1xuXG4gICAgICAgIHNlbGYuX3VucHVibGlzaGVkQnVmZmVyLnJlbW92ZShtYXhCdWZmZXJlZElkKTtcblxuICAgICAgICAvLyBTaW5jZSBzb21ldGhpbmcgbWF0Y2hpbmcgaXMgcmVtb3ZlZCBmcm9tIGNhY2hlIChib3RoIHB1Ymxpc2hlZCBzZXQgYW5kXG4gICAgICAgIC8vIGJ1ZmZlciksIHNldCBmbGFnIHRvIGZhbHNlXG4gICAgICAgIHNlbGYuX3NhZmVBcHBlbmRUb0J1ZmZlciA9IGZhbHNlO1xuICAgICAgfVxuICAgIH0pO1xuICB9LFxuICAvLyBJcyBjYWxsZWQgZWl0aGVyIHRvIHJlbW92ZSB0aGUgZG9jIGNvbXBsZXRlbHkgZnJvbSBtYXRjaGluZyBzZXQgb3IgdG8gbW92ZVxuICAvLyBpdCB0byB0aGUgcHVibGlzaGVkIHNldCBsYXRlci5cbiAgX3JlbW92ZUJ1ZmZlcmVkOiBmdW5jdGlvbiAoaWQpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgTWV0ZW9yLl9ub1lpZWxkc0FsbG93ZWQoZnVuY3Rpb24gKCkge1xuICAgICAgc2VsZi5fdW5wdWJsaXNoZWRCdWZmZXIucmVtb3ZlKGlkKTtcbiAgICAgIC8vIFRvIGtlZXAgdGhlIGNvbnRyYWN0IFwiYnVmZmVyIGlzIG5ldmVyIGVtcHR5IGluIFNURUFEWSBwaGFzZSB1bmxlc3MgdGhlXG4gICAgICAvLyBldmVyeXRoaW5nIG1hdGNoaW5nIGZpdHMgaW50byBwdWJsaXNoZWRcIiB0cnVlLCB3ZSBwb2xsIGV2ZXJ5dGhpbmcgYXNcbiAgICAgIC8vIHNvb24gYXMgd2Ugc2VlIHRoZSBidWZmZXIgYmVjb21pbmcgZW1wdHkuXG4gICAgICBpZiAoISBzZWxmLl91bnB1Ymxpc2hlZEJ1ZmZlci5zaXplKCkgJiYgISBzZWxmLl9zYWZlQXBwZW5kVG9CdWZmZXIpXG4gICAgICAgIHNlbGYuX25lZWRUb1BvbGxRdWVyeSgpO1xuICAgIH0pO1xuICB9LFxuICAvLyBDYWxsZWQgd2hlbiBhIGRvY3VtZW50IGhhcyBqb2luZWQgdGhlIFwiTWF0Y2hpbmdcIiByZXN1bHRzIHNldC5cbiAgLy8gVGFrZXMgcmVzcG9uc2liaWxpdHkgb2Yga2VlcGluZyBfdW5wdWJsaXNoZWRCdWZmZXIgaW4gc3luYyB3aXRoIF9wdWJsaXNoZWRcbiAgLy8gYW5kIHRoZSBlZmZlY3Qgb2YgbGltaXQgZW5mb3JjZWQuXG4gIF9hZGRNYXRjaGluZzogZnVuY3Rpb24gKGRvYykge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICBNZXRlb3IuX25vWWllbGRzQWxsb3dlZChmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgaWQgPSBkb2MuX2lkO1xuICAgICAgaWYgKHNlbGYuX3B1Ymxpc2hlZC5oYXMoaWQpKVxuICAgICAgICB0aHJvdyBFcnJvcihcInRyaWVkIHRvIGFkZCBzb21ldGhpbmcgYWxyZWFkeSBwdWJsaXNoZWQgXCIgKyBpZCk7XG4gICAgICBpZiAoc2VsZi5fbGltaXQgJiYgc2VsZi5fdW5wdWJsaXNoZWRCdWZmZXIuaGFzKGlkKSlcbiAgICAgICAgdGhyb3cgRXJyb3IoXCJ0cmllZCB0byBhZGQgc29tZXRoaW5nIGFscmVhZHkgZXhpc3RlZCBpbiBidWZmZXIgXCIgKyBpZCk7XG5cbiAgICAgIHZhciBsaW1pdCA9IHNlbGYuX2xpbWl0O1xuICAgICAgdmFyIGNvbXBhcmF0b3IgPSBzZWxmLl9jb21wYXJhdG9yO1xuICAgICAgdmFyIG1heFB1Ymxpc2hlZCA9IChsaW1pdCAmJiBzZWxmLl9wdWJsaXNoZWQuc2l6ZSgpID4gMCkgP1xuICAgICAgICBzZWxmLl9wdWJsaXNoZWQuZ2V0KHNlbGYuX3B1Ymxpc2hlZC5tYXhFbGVtZW50SWQoKSkgOiBudWxsO1xuICAgICAgdmFyIG1heEJ1ZmZlcmVkID0gKGxpbWl0ICYmIHNlbGYuX3VucHVibGlzaGVkQnVmZmVyLnNpemUoKSA+IDApXG4gICAgICAgID8gc2VsZi5fdW5wdWJsaXNoZWRCdWZmZXIuZ2V0KHNlbGYuX3VucHVibGlzaGVkQnVmZmVyLm1heEVsZW1lbnRJZCgpKVxuICAgICAgICA6IG51bGw7XG4gICAgICAvLyBUaGUgcXVlcnkgaXMgdW5saW1pdGVkIG9yIGRpZG4ndCBwdWJsaXNoIGVub3VnaCBkb2N1bWVudHMgeWV0IG9yIHRoZVxuICAgICAgLy8gbmV3IGRvY3VtZW50IHdvdWxkIGZpdCBpbnRvIHB1Ymxpc2hlZCBzZXQgcHVzaGluZyB0aGUgbWF4aW11bSBlbGVtZW50XG4gICAgICAvLyBvdXQsIHRoZW4gd2UgbmVlZCB0byBwdWJsaXNoIHRoZSBkb2MuXG4gICAgICB2YXIgdG9QdWJsaXNoID0gISBsaW1pdCB8fCBzZWxmLl9wdWJsaXNoZWQuc2l6ZSgpIDwgbGltaXQgfHxcbiAgICAgICAgY29tcGFyYXRvcihkb2MsIG1heFB1Ymxpc2hlZCkgPCAwO1xuXG4gICAgICAvLyBPdGhlcndpc2Ugd2UgbWlnaHQgbmVlZCB0byBidWZmZXIgaXQgKG9ubHkgaW4gY2FzZSBvZiBsaW1pdGVkIHF1ZXJ5KS5cbiAgICAgIC8vIEJ1ZmZlcmluZyBpcyBhbGxvd2VkIGlmIHRoZSBidWZmZXIgaXMgbm90IGZpbGxlZCB1cCB5ZXQgYW5kIGFsbFxuICAgICAgLy8gbWF0Y2hpbmcgZG9jcyBhcmUgZWl0aGVyIGluIHRoZSBwdWJsaXNoZWQgc2V0IG9yIGluIHRoZSBidWZmZXIuXG4gICAgICB2YXIgY2FuQXBwZW5kVG9CdWZmZXIgPSAhdG9QdWJsaXNoICYmIHNlbGYuX3NhZmVBcHBlbmRUb0J1ZmZlciAmJlxuICAgICAgICBzZWxmLl91bnB1Ymxpc2hlZEJ1ZmZlci5zaXplKCkgPCBsaW1pdDtcblxuICAgICAgLy8gT3IgaWYgaXQgaXMgc21hbGwgZW5vdWdoIHRvIGJlIHNhZmVseSBpbnNlcnRlZCB0byB0aGUgbWlkZGxlIG9yIHRoZVxuICAgICAgLy8gYmVnaW5uaW5nIG9mIHRoZSBidWZmZXIuXG4gICAgICB2YXIgY2FuSW5zZXJ0SW50b0J1ZmZlciA9ICF0b1B1Ymxpc2ggJiYgbWF4QnVmZmVyZWQgJiZcbiAgICAgICAgY29tcGFyYXRvcihkb2MsIG1heEJ1ZmZlcmVkKSA8PSAwO1xuXG4gICAgICB2YXIgdG9CdWZmZXIgPSBjYW5BcHBlbmRUb0J1ZmZlciB8fCBjYW5JbnNlcnRJbnRvQnVmZmVyO1xuXG4gICAgICBpZiAodG9QdWJsaXNoKSB7XG4gICAgICAgIHNlbGYuX2FkZFB1Ymxpc2hlZChpZCwgZG9jKTtcbiAgICAgIH0gZWxzZSBpZiAodG9CdWZmZXIpIHtcbiAgICAgICAgc2VsZi5fYWRkQnVmZmVyZWQoaWQsIGRvYyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBkcm9wcGluZyBpdCBhbmQgbm90IHNhdmluZyB0byB0aGUgY2FjaGVcbiAgICAgICAgc2VsZi5fc2FmZUFwcGVuZFRvQnVmZmVyID0gZmFsc2U7XG4gICAgICB9XG4gICAgfSk7XG4gIH0sXG4gIC8vIENhbGxlZCB3aGVuIGEgZG9jdW1lbnQgbGVhdmVzIHRoZSBcIk1hdGNoaW5nXCIgcmVzdWx0cyBzZXQuXG4gIC8vIFRha2VzIHJlc3BvbnNpYmlsaXR5IG9mIGtlZXBpbmcgX3VucHVibGlzaGVkQnVmZmVyIGluIHN5bmMgd2l0aCBfcHVibGlzaGVkXG4gIC8vIGFuZCB0aGUgZWZmZWN0IG9mIGxpbWl0IGVuZm9yY2VkLlxuICBfcmVtb3ZlTWF0Y2hpbmc6IGZ1bmN0aW9uIChpZCkge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICBNZXRlb3IuX25vWWllbGRzQWxsb3dlZChmdW5jdGlvbiAoKSB7XG4gICAgICBpZiAoISBzZWxmLl9wdWJsaXNoZWQuaGFzKGlkKSAmJiAhIHNlbGYuX2xpbWl0KVxuICAgICAgICB0aHJvdyBFcnJvcihcInRyaWVkIHRvIHJlbW92ZSBzb21ldGhpbmcgbWF0Y2hpbmcgYnV0IG5vdCBjYWNoZWQgXCIgKyBpZCk7XG5cbiAgICAgIGlmIChzZWxmLl9wdWJsaXNoZWQuaGFzKGlkKSkge1xuICAgICAgICBzZWxmLl9yZW1vdmVQdWJsaXNoZWQoaWQpO1xuICAgICAgfSBlbHNlIGlmIChzZWxmLl91bnB1Ymxpc2hlZEJ1ZmZlci5oYXMoaWQpKSB7XG4gICAgICAgIHNlbGYuX3JlbW92ZUJ1ZmZlcmVkKGlkKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfSxcbiAgX2hhbmRsZURvYzogZnVuY3Rpb24gKGlkLCBuZXdEb2MpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgTWV0ZW9yLl9ub1lpZWxkc0FsbG93ZWQoZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIG1hdGNoZXNOb3cgPSBuZXdEb2MgJiYgc2VsZi5fbWF0Y2hlci5kb2N1bWVudE1hdGNoZXMobmV3RG9jKS5yZXN1bHQ7XG5cbiAgICAgIHZhciBwdWJsaXNoZWRCZWZvcmUgPSBzZWxmLl9wdWJsaXNoZWQuaGFzKGlkKTtcbiAgICAgIHZhciBidWZmZXJlZEJlZm9yZSA9IHNlbGYuX2xpbWl0ICYmIHNlbGYuX3VucHVibGlzaGVkQnVmZmVyLmhhcyhpZCk7XG4gICAgICB2YXIgY2FjaGVkQmVmb3JlID0gcHVibGlzaGVkQmVmb3JlIHx8IGJ1ZmZlcmVkQmVmb3JlO1xuXG4gICAgICBpZiAobWF0Y2hlc05vdyAmJiAhY2FjaGVkQmVmb3JlKSB7XG4gICAgICAgIHNlbGYuX2FkZE1hdGNoaW5nKG5ld0RvYyk7XG4gICAgICB9IGVsc2UgaWYgKGNhY2hlZEJlZm9yZSAmJiAhbWF0Y2hlc05vdykge1xuICAgICAgICBzZWxmLl9yZW1vdmVNYXRjaGluZyhpZCk7XG4gICAgICB9IGVsc2UgaWYgKGNhY2hlZEJlZm9yZSAmJiBtYXRjaGVzTm93KSB7XG4gICAgICAgIHZhciBvbGREb2MgPSBzZWxmLl9wdWJsaXNoZWQuZ2V0KGlkKTtcbiAgICAgICAgdmFyIGNvbXBhcmF0b3IgPSBzZWxmLl9jb21wYXJhdG9yO1xuICAgICAgICB2YXIgbWluQnVmZmVyZWQgPSBzZWxmLl9saW1pdCAmJiBzZWxmLl91bnB1Ymxpc2hlZEJ1ZmZlci5zaXplKCkgJiZcbiAgICAgICAgICBzZWxmLl91bnB1Ymxpc2hlZEJ1ZmZlci5nZXQoc2VsZi5fdW5wdWJsaXNoZWRCdWZmZXIubWluRWxlbWVudElkKCkpO1xuICAgICAgICB2YXIgbWF4QnVmZmVyZWQ7XG5cbiAgICAgICAgaWYgKHB1Ymxpc2hlZEJlZm9yZSkge1xuICAgICAgICAgIC8vIFVubGltaXRlZCBjYXNlIHdoZXJlIHRoZSBkb2N1bWVudCBzdGF5cyBpbiBwdWJsaXNoZWQgb25jZSBpdFxuICAgICAgICAgIC8vIG1hdGNoZXMgb3IgdGhlIGNhc2Ugd2hlbiB3ZSBkb24ndCBoYXZlIGVub3VnaCBtYXRjaGluZyBkb2NzIHRvXG4gICAgICAgICAgLy8gcHVibGlzaCBvciB0aGUgY2hhbmdlZCBidXQgbWF0Y2hpbmcgZG9jIHdpbGwgc3RheSBpbiBwdWJsaXNoZWRcbiAgICAgICAgICAvLyBhbnl3YXlzLlxuICAgICAgICAgIC8vXG4gICAgICAgICAgLy8gWFhYOiBXZSByZWx5IG9uIHRoZSBlbXB0aW5lc3Mgb2YgYnVmZmVyLiBCZSBzdXJlIHRvIG1haW50YWluIHRoZVxuICAgICAgICAgIC8vIGZhY3QgdGhhdCBidWZmZXIgY2FuJ3QgYmUgZW1wdHkgaWYgdGhlcmUgYXJlIG1hdGNoaW5nIGRvY3VtZW50cyBub3RcbiAgICAgICAgICAvLyBwdWJsaXNoZWQuIE5vdGFibHksIHdlIGRvbid0IHdhbnQgdG8gc2NoZWR1bGUgcmVwb2xsIGFuZCBjb250aW51ZVxuICAgICAgICAgIC8vIHJlbHlpbmcgb24gdGhpcyBwcm9wZXJ0eS5cbiAgICAgICAgICB2YXIgc3RheXNJblB1Ymxpc2hlZCA9ICEgc2VsZi5fbGltaXQgfHxcbiAgICAgICAgICAgIHNlbGYuX3VucHVibGlzaGVkQnVmZmVyLnNpemUoKSA9PT0gMCB8fFxuICAgICAgICAgICAgY29tcGFyYXRvcihuZXdEb2MsIG1pbkJ1ZmZlcmVkKSA8PSAwO1xuXG4gICAgICAgICAgaWYgKHN0YXlzSW5QdWJsaXNoZWQpIHtcbiAgICAgICAgICAgIHNlbGYuX2NoYW5nZVB1Ymxpc2hlZChpZCwgb2xkRG9jLCBuZXdEb2MpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBhZnRlciB0aGUgY2hhbmdlIGRvYyBkb2Vzbid0IHN0YXkgaW4gdGhlIHB1Ymxpc2hlZCwgcmVtb3ZlIGl0XG4gICAgICAgICAgICBzZWxmLl9yZW1vdmVQdWJsaXNoZWQoaWQpO1xuICAgICAgICAgICAgLy8gYnV0IGl0IGNhbiBtb3ZlIGludG8gYnVmZmVyZWQgbm93LCBjaGVjayBpdFxuICAgICAgICAgICAgbWF4QnVmZmVyZWQgPSBzZWxmLl91bnB1Ymxpc2hlZEJ1ZmZlci5nZXQoXG4gICAgICAgICAgICAgIHNlbGYuX3VucHVibGlzaGVkQnVmZmVyLm1heEVsZW1lbnRJZCgpKTtcblxuICAgICAgICAgICAgdmFyIHRvQnVmZmVyID0gc2VsZi5fc2FmZUFwcGVuZFRvQnVmZmVyIHx8XG4gICAgICAgICAgICAgICAgICAobWF4QnVmZmVyZWQgJiYgY29tcGFyYXRvcihuZXdEb2MsIG1heEJ1ZmZlcmVkKSA8PSAwKTtcblxuICAgICAgICAgICAgaWYgKHRvQnVmZmVyKSB7XG4gICAgICAgICAgICAgIHNlbGYuX2FkZEJ1ZmZlcmVkKGlkLCBuZXdEb2MpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgLy8gVGhyb3cgYXdheSBmcm9tIGJvdGggcHVibGlzaGVkIHNldCBhbmQgYnVmZmVyXG4gICAgICAgICAgICAgIHNlbGYuX3NhZmVBcHBlbmRUb0J1ZmZlciA9IGZhbHNlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmIChidWZmZXJlZEJlZm9yZSkge1xuICAgICAgICAgIG9sZERvYyA9IHNlbGYuX3VucHVibGlzaGVkQnVmZmVyLmdldChpZCk7XG4gICAgICAgICAgLy8gcmVtb3ZlIHRoZSBvbGQgdmVyc2lvbiBtYW51YWxseSBpbnN0ZWFkIG9mIHVzaW5nIF9yZW1vdmVCdWZmZXJlZCBzb1xuICAgICAgICAgIC8vIHdlIGRvbid0IHRyaWdnZXIgdGhlIHF1ZXJ5aW5nIGltbWVkaWF0ZWx5LiAgaWYgd2UgZW5kIHRoaXMgYmxvY2tcbiAgICAgICAgICAvLyB3aXRoIHRoZSBidWZmZXIgZW1wdHksIHdlIHdpbGwgbmVlZCB0byB0cmlnZ2VyIHRoZSBxdWVyeSBwb2xsXG4gICAgICAgICAgLy8gbWFudWFsbHkgdG9vLlxuICAgICAgICAgIHNlbGYuX3VucHVibGlzaGVkQnVmZmVyLnJlbW92ZShpZCk7XG5cbiAgICAgICAgICB2YXIgbWF4UHVibGlzaGVkID0gc2VsZi5fcHVibGlzaGVkLmdldChcbiAgICAgICAgICAgIHNlbGYuX3B1Ymxpc2hlZC5tYXhFbGVtZW50SWQoKSk7XG4gICAgICAgICAgbWF4QnVmZmVyZWQgPSBzZWxmLl91bnB1Ymxpc2hlZEJ1ZmZlci5zaXplKCkgJiZcbiAgICAgICAgICAgICAgICBzZWxmLl91bnB1Ymxpc2hlZEJ1ZmZlci5nZXQoXG4gICAgICAgICAgICAgICAgICBzZWxmLl91bnB1Ymxpc2hlZEJ1ZmZlci5tYXhFbGVtZW50SWQoKSk7XG5cbiAgICAgICAgICAvLyB0aGUgYnVmZmVyZWQgZG9jIHdhcyB1cGRhdGVkLCBpdCBjb3VsZCBtb3ZlIHRvIHB1Ymxpc2hlZFxuICAgICAgICAgIHZhciB0b1B1Ymxpc2ggPSBjb21wYXJhdG9yKG5ld0RvYywgbWF4UHVibGlzaGVkKSA8IDA7XG5cbiAgICAgICAgICAvLyBvciBzdGF5cyBpbiBidWZmZXIgZXZlbiBhZnRlciB0aGUgY2hhbmdlXG4gICAgICAgICAgdmFyIHN0YXlzSW5CdWZmZXIgPSAoISB0b1B1Ymxpc2ggJiYgc2VsZi5fc2FmZUFwcGVuZFRvQnVmZmVyKSB8fFxuICAgICAgICAgICAgICAgICghdG9QdWJsaXNoICYmIG1heEJ1ZmZlcmVkICYmXG4gICAgICAgICAgICAgICAgIGNvbXBhcmF0b3IobmV3RG9jLCBtYXhCdWZmZXJlZCkgPD0gMCk7XG5cbiAgICAgICAgICBpZiAodG9QdWJsaXNoKSB7XG4gICAgICAgICAgICBzZWxmLl9hZGRQdWJsaXNoZWQoaWQsIG5ld0RvYyk7XG4gICAgICAgICAgfSBlbHNlIGlmIChzdGF5c0luQnVmZmVyKSB7XG4gICAgICAgICAgICAvLyBzdGF5cyBpbiBidWZmZXIgYnV0IGNoYW5nZXNcbiAgICAgICAgICAgIHNlbGYuX3VucHVibGlzaGVkQnVmZmVyLnNldChpZCwgbmV3RG9jKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gVGhyb3cgYXdheSBmcm9tIGJvdGggcHVibGlzaGVkIHNldCBhbmQgYnVmZmVyXG4gICAgICAgICAgICBzZWxmLl9zYWZlQXBwZW5kVG9CdWZmZXIgPSBmYWxzZTtcbiAgICAgICAgICAgIC8vIE5vcm1hbGx5IHRoaXMgY2hlY2sgd291bGQgaGF2ZSBiZWVuIGRvbmUgaW4gX3JlbW92ZUJ1ZmZlcmVkIGJ1dFxuICAgICAgICAgICAgLy8gd2UgZGlkbid0IHVzZSBpdCwgc28gd2UgbmVlZCB0byBkbyBpdCBvdXJzZWxmIG5vdy5cbiAgICAgICAgICAgIGlmICghIHNlbGYuX3VucHVibGlzaGVkQnVmZmVyLnNpemUoKSkge1xuICAgICAgICAgICAgICBzZWxmLl9uZWVkVG9Qb2xsUXVlcnkoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiY2FjaGVkQmVmb3JlIGltcGxpZXMgZWl0aGVyIG9mIHB1Ymxpc2hlZEJlZm9yZSBvciBidWZmZXJlZEJlZm9yZSBpcyB0cnVlLlwiKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pO1xuICB9LFxuICBfZmV0Y2hNb2RpZmllZERvY3VtZW50czogZnVuY3Rpb24gKCkge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICBNZXRlb3IuX25vWWllbGRzQWxsb3dlZChmdW5jdGlvbiAoKSB7XG4gICAgICBzZWxmLl9yZWdpc3RlclBoYXNlQ2hhbmdlKFBIQVNFLkZFVENISU5HKTtcbiAgICAgIC8vIERlZmVyLCBiZWNhdXNlIG5vdGhpbmcgY2FsbGVkIGZyb20gdGhlIG9wbG9nIGVudHJ5IGhhbmRsZXIgbWF5IHlpZWxkLFxuICAgICAgLy8gYnV0IGZldGNoKCkgeWllbGRzLlxuICAgICAgTWV0ZW9yLmRlZmVyKGZpbmlzaElmTmVlZFRvUG9sbFF1ZXJ5KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgd2hpbGUgKCFzZWxmLl9zdG9wcGVkICYmICFzZWxmLl9uZWVkVG9GZXRjaC5lbXB0eSgpKSB7XG4gICAgICAgICAgaWYgKHNlbGYuX3BoYXNlID09PSBQSEFTRS5RVUVSWUlORykge1xuICAgICAgICAgICAgLy8gV2hpbGUgZmV0Y2hpbmcsIHdlIGRlY2lkZWQgdG8gZ28gaW50byBRVUVSWUlORyBtb2RlLCBhbmQgdGhlbiB3ZVxuICAgICAgICAgICAgLy8gc2F3IGFub3RoZXIgb3Bsb2cgZW50cnksIHNvIF9uZWVkVG9GZXRjaCBpcyBub3QgZW1wdHkuIEJ1dCB3ZVxuICAgICAgICAgICAgLy8gc2hvdWxkbid0IGZldGNoIHRoZXNlIGRvY3VtZW50cyB1bnRpbCBBRlRFUiB0aGUgcXVlcnkgaXMgZG9uZS5cbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIC8vIEJlaW5nIGluIHN0ZWFkeSBwaGFzZSBoZXJlIHdvdWxkIGJlIHN1cnByaXNpbmcuXG4gICAgICAgICAgaWYgKHNlbGYuX3BoYXNlICE9PSBQSEFTRS5GRVRDSElORylcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcInBoYXNlIGluIGZldGNoTW9kaWZpZWREb2N1bWVudHM6IFwiICsgc2VsZi5fcGhhc2UpO1xuXG4gICAgICAgICAgc2VsZi5fY3VycmVudGx5RmV0Y2hpbmcgPSBzZWxmLl9uZWVkVG9GZXRjaDtcbiAgICAgICAgICB2YXIgdGhpc0dlbmVyYXRpb24gPSArK3NlbGYuX2ZldGNoR2VuZXJhdGlvbjtcbiAgICAgICAgICBzZWxmLl9uZWVkVG9GZXRjaCA9IG5ldyBMb2NhbENvbGxlY3Rpb24uX0lkTWFwO1xuICAgICAgICAgIHZhciB3YWl0aW5nID0gMDtcbiAgICAgICAgICB2YXIgZnV0ID0gbmV3IEZ1dHVyZTtcbiAgICAgICAgICAvLyBUaGlzIGxvb3AgaXMgc2FmZSwgYmVjYXVzZSBfY3VycmVudGx5RmV0Y2hpbmcgd2lsbCBub3QgYmUgdXBkYXRlZFxuICAgICAgICAgIC8vIGR1cmluZyB0aGlzIGxvb3AgKGluIGZhY3QsIGl0IGlzIG5ldmVyIG11dGF0ZWQpLlxuICAgICAgICAgIHNlbGYuX2N1cnJlbnRseUZldGNoaW5nLmZvckVhY2goZnVuY3Rpb24gKG9wLCBpZCkge1xuICAgICAgICAgICAgd2FpdGluZysrO1xuICAgICAgICAgICAgc2VsZi5fbW9uZ29IYW5kbGUuX2RvY0ZldGNoZXIuZmV0Y2goXG4gICAgICAgICAgICAgIHNlbGYuX2N1cnNvckRlc2NyaXB0aW9uLmNvbGxlY3Rpb25OYW1lLCBpZCwgb3AsXG4gICAgICAgICAgICAgIGZpbmlzaElmTmVlZFRvUG9sbFF1ZXJ5KGZ1bmN0aW9uIChlcnIsIGRvYykge1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgICAgIE1ldGVvci5fZGVidWcoXCJHb3QgZXhjZXB0aW9uIHdoaWxlIGZldGNoaW5nIGRvY3VtZW50c1wiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVycik7XG4gICAgICAgICAgICAgICAgICAgIC8vIElmIHdlIGdldCBhbiBlcnJvciBmcm9tIHRoZSBmZXRjaGVyIChlZywgdHJvdWJsZVxuICAgICAgICAgICAgICAgICAgICAvLyBjb25uZWN0aW5nIHRvIE1vbmdvKSwgbGV0J3MganVzdCBhYmFuZG9uIHRoZSBmZXRjaCBwaGFzZVxuICAgICAgICAgICAgICAgICAgICAvLyBhbHRvZ2V0aGVyIGFuZCBmYWxsIGJhY2sgdG8gcG9sbGluZy4gSXQncyBub3QgbGlrZSB3ZSdyZVxuICAgICAgICAgICAgICAgICAgICAvLyBnZXR0aW5nIGxpdmUgdXBkYXRlcyBhbnl3YXkuXG4gICAgICAgICAgICAgICAgICAgIGlmIChzZWxmLl9waGFzZSAhPT0gUEhBU0UuUVVFUllJTkcpIHtcbiAgICAgICAgICAgICAgICAgICAgICBzZWxmLl9uZWVkVG9Qb2xsUXVlcnkoKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmICghc2VsZi5fc3RvcHBlZCAmJiBzZWxmLl9waGFzZSA9PT0gUEhBU0UuRkVUQ0hJTkdcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJiYgc2VsZi5fZmV0Y2hHZW5lcmF0aW9uID09PSB0aGlzR2VuZXJhdGlvbikge1xuICAgICAgICAgICAgICAgICAgICAvLyBXZSByZS1jaGVjayB0aGUgZ2VuZXJhdGlvbiBpbiBjYXNlIHdlJ3ZlIGhhZCBhbiBleHBsaWNpdFxuICAgICAgICAgICAgICAgICAgICAvLyBfcG9sbFF1ZXJ5IGNhbGwgKGVnLCBpbiBhbm90aGVyIGZpYmVyKSB3aGljaCBzaG91bGRcbiAgICAgICAgICAgICAgICAgICAgLy8gZWZmZWN0aXZlbHkgY2FuY2VsIHRoaXMgcm91bmQgb2YgZmV0Y2hlcy4gIChfcG9sbFF1ZXJ5XG4gICAgICAgICAgICAgICAgICAgIC8vIGluY3JlbWVudHMgdGhlIGdlbmVyYXRpb24uKVxuICAgICAgICAgICAgICAgICAgICBzZWxmLl9oYW5kbGVEb2MoaWQsIGRvYyk7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICAgICAgICAgIHdhaXRpbmctLTtcbiAgICAgICAgICAgICAgICAgIC8vIEJlY2F1c2UgZmV0Y2goKSBuZXZlciBjYWxscyBpdHMgY2FsbGJhY2sgc3luY2hyb25vdXNseSxcbiAgICAgICAgICAgICAgICAgIC8vIHRoaXMgaXMgc2FmZSAoaWUsIHdlIHdvbid0IGNhbGwgZnV0LnJldHVybigpIGJlZm9yZSB0aGVcbiAgICAgICAgICAgICAgICAgIC8vIGZvckVhY2ggaXMgZG9uZSkuXG4gICAgICAgICAgICAgICAgICBpZiAod2FpdGluZyA9PT0gMClcbiAgICAgICAgICAgICAgICAgICAgZnV0LnJldHVybigpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgIH0pO1xuICAgICAgICAgIGZ1dC53YWl0KCk7XG4gICAgICAgICAgLy8gRXhpdCBub3cgaWYgd2UndmUgaGFkIGEgX3BvbGxRdWVyeSBjYWxsIChoZXJlIG9yIGluIGFub3RoZXIgZmliZXIpLlxuICAgICAgICAgIGlmIChzZWxmLl9waGFzZSA9PT0gUEhBU0UuUVVFUllJTkcpXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgc2VsZi5fY3VycmVudGx5RmV0Y2hpbmcgPSBudWxsO1xuICAgICAgICB9XG4gICAgICAgIC8vIFdlJ3JlIGRvbmUgZmV0Y2hpbmcsIHNvIHdlIGNhbiBiZSBzdGVhZHksIHVubGVzcyB3ZSd2ZSBoYWQgYVxuICAgICAgICAvLyBfcG9sbFF1ZXJ5IGNhbGwgKGhlcmUgb3IgaW4gYW5vdGhlciBmaWJlcikuXG4gICAgICAgIGlmIChzZWxmLl9waGFzZSAhPT0gUEhBU0UuUVVFUllJTkcpXG4gICAgICAgICAgc2VsZi5fYmVTdGVhZHkoKTtcbiAgICAgIH0pKTtcbiAgICB9KTtcbiAgfSxcbiAgX2JlU3RlYWR5OiBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIE1ldGVvci5fbm9ZaWVsZHNBbGxvd2VkKGZ1bmN0aW9uICgpIHtcbiAgICAgIHNlbGYuX3JlZ2lzdGVyUGhhc2VDaGFuZ2UoUEhBU0UuU1RFQURZKTtcbiAgICAgIHZhciB3cml0ZXMgPSBzZWxmLl93cml0ZXNUb0NvbW1pdFdoZW5XZVJlYWNoU3RlYWR5O1xuICAgICAgc2VsZi5fd3JpdGVzVG9Db21taXRXaGVuV2VSZWFjaFN0ZWFkeSA9IFtdO1xuICAgICAgc2VsZi5fbXVsdGlwbGV4ZXIub25GbHVzaChmdW5jdGlvbiAoKSB7XG4gICAgICAgIF8uZWFjaCh3cml0ZXMsIGZ1bmN0aW9uICh3KSB7XG4gICAgICAgICAgdy5jb21taXR0ZWQoKTtcbiAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfSxcbiAgX2hhbmRsZU9wbG9nRW50cnlRdWVyeWluZzogZnVuY3Rpb24gKG9wKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIE1ldGVvci5fbm9ZaWVsZHNBbGxvd2VkKGZ1bmN0aW9uICgpIHtcbiAgICAgIHNlbGYuX25lZWRUb0ZldGNoLnNldChpZEZvck9wKG9wKSwgb3ApO1xuICAgIH0pO1xuICB9LFxuICBfaGFuZGxlT3Bsb2dFbnRyeVN0ZWFkeU9yRmV0Y2hpbmc6IGZ1bmN0aW9uIChvcCkge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICBNZXRlb3IuX25vWWllbGRzQWxsb3dlZChmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgaWQgPSBpZEZvck9wKG9wKTtcbiAgICAgIC8vIElmIHdlJ3JlIGFscmVhZHkgZmV0Y2hpbmcgdGhpcyBvbmUsIG9yIGFib3V0IHRvLCB3ZSBjYW4ndCBvcHRpbWl6ZTtcbiAgICAgIC8vIG1ha2Ugc3VyZSB0aGF0IHdlIGZldGNoIGl0IGFnYWluIGlmIG5lY2Vzc2FyeS5cbiAgICAgIGlmIChzZWxmLl9waGFzZSA9PT0gUEhBU0UuRkVUQ0hJTkcgJiZcbiAgICAgICAgICAoKHNlbGYuX2N1cnJlbnRseUZldGNoaW5nICYmIHNlbGYuX2N1cnJlbnRseUZldGNoaW5nLmhhcyhpZCkpIHx8XG4gICAgICAgICAgIHNlbGYuX25lZWRUb0ZldGNoLmhhcyhpZCkpKSB7XG4gICAgICAgIHNlbGYuX25lZWRUb0ZldGNoLnNldChpZCwgb3ApO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGlmIChvcC5vcCA9PT0gJ2QnKSB7XG4gICAgICAgIGlmIChzZWxmLl9wdWJsaXNoZWQuaGFzKGlkKSB8fFxuICAgICAgICAgICAgKHNlbGYuX2xpbWl0ICYmIHNlbGYuX3VucHVibGlzaGVkQnVmZmVyLmhhcyhpZCkpKVxuICAgICAgICAgIHNlbGYuX3JlbW92ZU1hdGNoaW5nKGlkKTtcbiAgICAgIH0gZWxzZSBpZiAob3Aub3AgPT09ICdpJykge1xuICAgICAgICBpZiAoc2VsZi5fcHVibGlzaGVkLmhhcyhpZCkpXG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiaW5zZXJ0IGZvdW5kIGZvciBhbHJlYWR5LWV4aXN0aW5nIElEIGluIHB1Ymxpc2hlZFwiKTtcbiAgICAgICAgaWYgKHNlbGYuX3VucHVibGlzaGVkQnVmZmVyICYmIHNlbGYuX3VucHVibGlzaGVkQnVmZmVyLmhhcyhpZCkpXG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiaW5zZXJ0IGZvdW5kIGZvciBhbHJlYWR5LWV4aXN0aW5nIElEIGluIGJ1ZmZlclwiKTtcblxuICAgICAgICAvLyBYWFggd2hhdCBpZiBzZWxlY3RvciB5aWVsZHM/ICBmb3Igbm93IGl0IGNhbid0IGJ1dCBsYXRlciBpdCBjb3VsZFxuICAgICAgICAvLyBoYXZlICR3aGVyZVxuICAgICAgICBpZiAoc2VsZi5fbWF0Y2hlci5kb2N1bWVudE1hdGNoZXMob3AubykucmVzdWx0KVxuICAgICAgICAgIHNlbGYuX2FkZE1hdGNoaW5nKG9wLm8pO1xuICAgICAgfSBlbHNlIGlmIChvcC5vcCA9PT0gJ3UnKSB7XG4gICAgICAgIC8vIHdlIGFyZSBtYXBwaW5nIHRoZSBuZXcgb3Bsb2cgZm9ybWF0IG9uIG1vbmdvIDVcbiAgICAgICAgLy8gdG8gd2hhdCB3ZSBrbm93IGJldHRlciwgJHNldFxuICAgICAgICBvcC5vID0gb3Bsb2dWMlYxQ29udmVydGVyKG9wLm8pXG4gICAgICAgIC8vIElzIHRoaXMgYSBtb2RpZmllciAoJHNldC8kdW5zZXQsIHdoaWNoIG1heSByZXF1aXJlIHVzIHRvIHBvbGwgdGhlXG4gICAgICAgIC8vIGRhdGFiYXNlIHRvIGZpZ3VyZSBvdXQgaWYgdGhlIHdob2xlIGRvY3VtZW50IG1hdGNoZXMgdGhlIHNlbGVjdG9yKSBvclxuICAgICAgICAvLyBhIHJlcGxhY2VtZW50IChpbiB3aGljaCBjYXNlIHdlIGNhbiBqdXN0IGRpcmVjdGx5IHJlLWV2YWx1YXRlIHRoZVxuICAgICAgICAvLyBzZWxlY3Rvcik/XG4gICAgICAgIC8vIG9wbG9nIGZvcm1hdCBoYXMgY2hhbmdlZCBvbiBtb25nb2RiIDUsIHdlIGhhdmUgdG8gc3VwcG9ydCBib3RoIG5vd1xuICAgICAgICAvLyBkaWZmIGlzIHRoZSBmb3JtYXQgaW4gTW9uZ28gNSsgKG9wbG9nIHYyKVxuICAgICAgICB2YXIgaXNSZXBsYWNlID0gIV8uaGFzKG9wLm8sICckc2V0JykgJiYgIV8uaGFzKG9wLm8sICdkaWZmJykgJiYgIV8uaGFzKG9wLm8sICckdW5zZXQnKTtcbiAgICAgICAgLy8gSWYgdGhpcyBtb2RpZmllciBtb2RpZmllcyBzb21ldGhpbmcgaW5zaWRlIGFuIEVKU09OIGN1c3RvbSB0eXBlIChpZSxcbiAgICAgICAgLy8gYW55dGhpbmcgd2l0aCBFSlNPTiQpLCB0aGVuIHdlIGNhbid0IHRyeSB0byB1c2VcbiAgICAgICAgLy8gTG9jYWxDb2xsZWN0aW9uLl9tb2RpZnksIHNpbmNlIHRoYXQganVzdCBtdXRhdGVzIHRoZSBFSlNPTiBlbmNvZGluZyxcbiAgICAgICAgLy8gbm90IHRoZSBhY3R1YWwgb2JqZWN0LlxuICAgICAgICB2YXIgY2FuRGlyZWN0bHlNb2RpZnlEb2MgPVxuICAgICAgICAgICFpc1JlcGxhY2UgJiYgbW9kaWZpZXJDYW5CZURpcmVjdGx5QXBwbGllZChvcC5vKTtcblxuICAgICAgICB2YXIgcHVibGlzaGVkQmVmb3JlID0gc2VsZi5fcHVibGlzaGVkLmhhcyhpZCk7XG4gICAgICAgIHZhciBidWZmZXJlZEJlZm9yZSA9IHNlbGYuX2xpbWl0ICYmIHNlbGYuX3VucHVibGlzaGVkQnVmZmVyLmhhcyhpZCk7XG5cbiAgICAgICAgaWYgKGlzUmVwbGFjZSkge1xuICAgICAgICAgIHNlbGYuX2hhbmRsZURvYyhpZCwgXy5leHRlbmQoe19pZDogaWR9LCBvcC5vKSk7XG4gICAgICAgIH0gZWxzZSBpZiAoKHB1Ymxpc2hlZEJlZm9yZSB8fCBidWZmZXJlZEJlZm9yZSkgJiZcbiAgICAgICAgICAgICAgICAgICBjYW5EaXJlY3RseU1vZGlmeURvYykge1xuICAgICAgICAgIC8vIE9oIGdyZWF0LCB3ZSBhY3R1YWxseSBrbm93IHdoYXQgdGhlIGRvY3VtZW50IGlzLCBzbyB3ZSBjYW4gYXBwbHlcbiAgICAgICAgICAvLyB0aGlzIGRpcmVjdGx5LlxuICAgICAgICAgIHZhciBuZXdEb2MgPSBzZWxmLl9wdWJsaXNoZWQuaGFzKGlkKVxuICAgICAgICAgICAgPyBzZWxmLl9wdWJsaXNoZWQuZ2V0KGlkKSA6IHNlbGYuX3VucHVibGlzaGVkQnVmZmVyLmdldChpZCk7XG4gICAgICAgICAgbmV3RG9jID0gRUpTT04uY2xvbmUobmV3RG9jKTtcblxuICAgICAgICAgIG5ld0RvYy5faWQgPSBpZDtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgTG9jYWxDb2xsZWN0aW9uLl9tb2RpZnkobmV3RG9jLCBvcC5vKTtcbiAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICBpZiAoZS5uYW1lICE9PSBcIk1pbmltb25nb0Vycm9yXCIpXG4gICAgICAgICAgICAgIHRocm93IGU7XG4gICAgICAgICAgICAvLyBXZSBkaWRuJ3QgdW5kZXJzdGFuZCB0aGUgbW9kaWZpZXIuICBSZS1mZXRjaC5cbiAgICAgICAgICAgIHNlbGYuX25lZWRUb0ZldGNoLnNldChpZCwgb3ApO1xuICAgICAgICAgICAgaWYgKHNlbGYuX3BoYXNlID09PSBQSEFTRS5TVEVBRFkpIHtcbiAgICAgICAgICAgICAgc2VsZi5fZmV0Y2hNb2RpZmllZERvY3VtZW50cygpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cbiAgICAgICAgICBzZWxmLl9oYW5kbGVEb2MoaWQsIHNlbGYuX3NoYXJlZFByb2plY3Rpb25GbihuZXdEb2MpKTtcbiAgICAgICAgfSBlbHNlIGlmICghY2FuRGlyZWN0bHlNb2RpZnlEb2MgfHxcbiAgICAgICAgICAgICAgICAgICBzZWxmLl9tYXRjaGVyLmNhbkJlY29tZVRydWVCeU1vZGlmaWVyKG9wLm8pIHx8XG4gICAgICAgICAgICAgICAgICAgKHNlbGYuX3NvcnRlciAmJiBzZWxmLl9zb3J0ZXIuYWZmZWN0ZWRCeU1vZGlmaWVyKG9wLm8pKSkge1xuICAgICAgICAgIHNlbGYuX25lZWRUb0ZldGNoLnNldChpZCwgb3ApO1xuICAgICAgICAgIGlmIChzZWxmLl9waGFzZSA9PT0gUEhBU0UuU1RFQURZKVxuICAgICAgICAgICAgc2VsZi5fZmV0Y2hNb2RpZmllZERvY3VtZW50cygpO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBFcnJvcihcIlhYWCBTVVJQUklTSU5HIE9QRVJBVElPTjogXCIgKyBvcCk7XG4gICAgICB9XG4gICAgfSk7XG4gIH0sXG4gIC8vIFlpZWxkcyFcbiAgX3J1bkluaXRpYWxRdWVyeTogZnVuY3Rpb24gKCkge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICBpZiAoc2VsZi5fc3RvcHBlZClcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIm9wbG9nIHN0b3BwZWQgc3VycHJpc2luZ2x5IGVhcmx5XCIpO1xuXG4gICAgc2VsZi5fcnVuUXVlcnkoe2luaXRpYWw6IHRydWV9KTsgIC8vIHlpZWxkc1xuXG4gICAgaWYgKHNlbGYuX3N0b3BwZWQpXG4gICAgICByZXR1cm47ICAvLyBjYW4gaGFwcGVuIG9uIHF1ZXJ5RXJyb3JcblxuICAgIC8vIEFsbG93IG9ic2VydmVDaGFuZ2VzIGNhbGxzIHRvIHJldHVybi4gKEFmdGVyIHRoaXMsIGl0J3MgcG9zc2libGUgZm9yXG4gICAgLy8gc3RvcCgpIHRvIGJlIGNhbGxlZC4pXG4gICAgc2VsZi5fbXVsdGlwbGV4ZXIucmVhZHkoKTtcblxuICAgIHNlbGYuX2RvbmVRdWVyeWluZygpOyAgLy8geWllbGRzXG4gIH0sXG5cbiAgLy8gSW4gdmFyaW91cyBjaXJjdW1zdGFuY2VzLCB3ZSBtYXkganVzdCB3YW50IHRvIHN0b3AgcHJvY2Vzc2luZyB0aGUgb3Bsb2cgYW5kXG4gIC8vIHJlLXJ1biB0aGUgaW5pdGlhbCBxdWVyeSwganVzdCBhcyBpZiB3ZSB3ZXJlIGEgUG9sbGluZ09ic2VydmVEcml2ZXIuXG4gIC8vXG4gIC8vIFRoaXMgZnVuY3Rpb24gbWF5IG5vdCBibG9jaywgYmVjYXVzZSBpdCBpcyBjYWxsZWQgZnJvbSBhbiBvcGxvZyBlbnRyeVxuICAvLyBoYW5kbGVyLlxuICAvL1xuICAvLyBYWFggV2Ugc2hvdWxkIGNhbGwgdGhpcyB3aGVuIHdlIGRldGVjdCB0aGF0IHdlJ3ZlIGJlZW4gaW4gRkVUQ0hJTkcgZm9yIFwidG9vXG4gIC8vIGxvbmdcIi5cbiAgLy9cbiAgLy8gWFhYIFdlIHNob3VsZCBjYWxsIHRoaXMgd2hlbiB3ZSBkZXRlY3QgTW9uZ28gZmFpbG92ZXIgKHNpbmNlIHRoYXQgbWlnaHRcbiAgLy8gbWVhbiB0aGF0IHNvbWUgb2YgdGhlIG9wbG9nIGVudHJpZXMgd2UgaGF2ZSBwcm9jZXNzZWQgaGF2ZSBiZWVuIHJvbGxlZFxuICAvLyBiYWNrKS4gVGhlIE5vZGUgTW9uZ28gZHJpdmVyIGlzIGluIHRoZSBtaWRkbGUgb2YgYSBidW5jaCBvZiBodWdlXG4gIC8vIHJlZmFjdG9yaW5ncywgaW5jbHVkaW5nIHRoZSB3YXkgdGhhdCBpdCBub3RpZmllcyB5b3Ugd2hlbiBwcmltYXJ5XG4gIC8vIGNoYW5nZXMuIFdpbGwgcHV0IG9mZiBpbXBsZW1lbnRpbmcgdGhpcyB1bnRpbCBkcml2ZXIgMS40IGlzIG91dC5cbiAgX3BvbGxRdWVyeTogZnVuY3Rpb24gKCkge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICBNZXRlb3IuX25vWWllbGRzQWxsb3dlZChmdW5jdGlvbiAoKSB7XG4gICAgICBpZiAoc2VsZi5fc3RvcHBlZClcbiAgICAgICAgcmV0dXJuO1xuXG4gICAgICAvLyBZYXksIHdlIGdldCB0byBmb3JnZXQgYWJvdXQgYWxsIHRoZSB0aGluZ3Mgd2UgdGhvdWdodCB3ZSBoYWQgdG8gZmV0Y2guXG4gICAgICBzZWxmLl9uZWVkVG9GZXRjaCA9IG5ldyBMb2NhbENvbGxlY3Rpb24uX0lkTWFwO1xuICAgICAgc2VsZi5fY3VycmVudGx5RmV0Y2hpbmcgPSBudWxsO1xuICAgICAgKytzZWxmLl9mZXRjaEdlbmVyYXRpb247ICAvLyBpZ25vcmUgYW55IGluLWZsaWdodCBmZXRjaGVzXG4gICAgICBzZWxmLl9yZWdpc3RlclBoYXNlQ2hhbmdlKFBIQVNFLlFVRVJZSU5HKTtcblxuICAgICAgLy8gRGVmZXIgc28gdGhhdCB3ZSBkb24ndCB5aWVsZC4gIFdlIGRvbid0IG5lZWQgZmluaXNoSWZOZWVkVG9Qb2xsUXVlcnlcbiAgICAgIC8vIGhlcmUgYmVjYXVzZSBTd2l0Y2hlZFRvUXVlcnkgaXMgbm90IHRocm93biBpbiBRVUVSWUlORyBtb2RlLlxuICAgICAgTWV0ZW9yLmRlZmVyKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgc2VsZi5fcnVuUXVlcnkoKTtcbiAgICAgICAgc2VsZi5fZG9uZVF1ZXJ5aW5nKCk7XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfSxcblxuICAvLyBZaWVsZHMhXG4gIF9ydW5RdWVyeTogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gICAgdmFyIG5ld1Jlc3VsdHMsIG5ld0J1ZmZlcjtcblxuICAgIC8vIFRoaXMgd2hpbGUgbG9vcCBpcyBqdXN0IHRvIHJldHJ5IGZhaWx1cmVzLlxuICAgIHdoaWxlICh0cnVlKSB7XG4gICAgICAvLyBJZiB3ZSd2ZSBiZWVuIHN0b3BwZWQsIHdlIGRvbid0IGhhdmUgdG8gcnVuIGFueXRoaW5nIGFueSBtb3JlLlxuICAgICAgaWYgKHNlbGYuX3N0b3BwZWQpXG4gICAgICAgIHJldHVybjtcblxuICAgICAgbmV3UmVzdWx0cyA9IG5ldyBMb2NhbENvbGxlY3Rpb24uX0lkTWFwO1xuICAgICAgbmV3QnVmZmVyID0gbmV3IExvY2FsQ29sbGVjdGlvbi5fSWRNYXA7XG5cbiAgICAgIC8vIFF1ZXJ5IDJ4IGRvY3VtZW50cyBhcyB0aGUgaGFsZiBleGNsdWRlZCBmcm9tIHRoZSBvcmlnaW5hbCBxdWVyeSB3aWxsIGdvXG4gICAgICAvLyBpbnRvIHVucHVibGlzaGVkIGJ1ZmZlciB0byByZWR1Y2UgYWRkaXRpb25hbCBNb25nbyBsb29rdXBzIGluIGNhc2VzXG4gICAgICAvLyB3aGVuIGRvY3VtZW50cyBhcmUgcmVtb3ZlZCBmcm9tIHRoZSBwdWJsaXNoZWQgc2V0IGFuZCBuZWVkIGFcbiAgICAgIC8vIHJlcGxhY2VtZW50LlxuICAgICAgLy8gWFhYIG5lZWRzIG1vcmUgdGhvdWdodCBvbiBub24temVybyBza2lwXG4gICAgICAvLyBYWFggMiBpcyBhIFwibWFnaWMgbnVtYmVyXCIgbWVhbmluZyB0aGVyZSBpcyBhbiBleHRyYSBjaHVuayBvZiBkb2NzIGZvclxuICAgICAgLy8gYnVmZmVyIGlmIHN1Y2ggaXMgbmVlZGVkLlxuICAgICAgdmFyIGN1cnNvciA9IHNlbGYuX2N1cnNvckZvclF1ZXJ5KHsgbGltaXQ6IHNlbGYuX2xpbWl0ICogMiB9KTtcbiAgICAgIHRyeSB7XG4gICAgICAgIGN1cnNvci5mb3JFYWNoKGZ1bmN0aW9uIChkb2MsIGkpIHsgIC8vIHlpZWxkc1xuICAgICAgICAgIGlmICghc2VsZi5fbGltaXQgfHwgaSA8IHNlbGYuX2xpbWl0KSB7XG4gICAgICAgICAgICBuZXdSZXN1bHRzLnNldChkb2MuX2lkLCBkb2MpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBuZXdCdWZmZXIuc2V0KGRvYy5faWQsIGRvYyk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGlmIChvcHRpb25zLmluaXRpYWwgJiYgdHlwZW9mKGUuY29kZSkgPT09ICdudW1iZXInKSB7XG4gICAgICAgICAgLy8gVGhpcyBpcyBhbiBlcnJvciBkb2N1bWVudCBzZW50IHRvIHVzIGJ5IG1vbmdvZCwgbm90IGEgY29ubmVjdGlvblxuICAgICAgICAgIC8vIGVycm9yIGdlbmVyYXRlZCBieSB0aGUgY2xpZW50LiBBbmQgd2UndmUgbmV2ZXIgc2VlbiB0aGlzIHF1ZXJ5IHdvcmtcbiAgICAgICAgICAvLyBzdWNjZXNzZnVsbHkuIFByb2JhYmx5IGl0J3MgYSBiYWQgc2VsZWN0b3Igb3Igc29tZXRoaW5nLCBzbyB3ZVxuICAgICAgICAgIC8vIHNob3VsZCBOT1QgcmV0cnkuIEluc3RlYWQsIHdlIHNob3VsZCBoYWx0IHRoZSBvYnNlcnZlICh3aGljaCBlbmRzXG4gICAgICAgICAgLy8gdXAgY2FsbGluZyBgc3RvcGAgb24gdXMpLlxuICAgICAgICAgIHNlbGYuX211bHRpcGxleGVyLnF1ZXJ5RXJyb3IoZSk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gRHVyaW5nIGZhaWxvdmVyIChlZykgaWYgd2UgZ2V0IGFuIGV4Y2VwdGlvbiB3ZSBzaG91bGQgbG9nIGFuZCByZXRyeVxuICAgICAgICAvLyBpbnN0ZWFkIG9mIGNyYXNoaW5nLlxuICAgICAgICBNZXRlb3IuX2RlYnVnKFwiR290IGV4Y2VwdGlvbiB3aGlsZSBwb2xsaW5nIHF1ZXJ5XCIsIGUpO1xuICAgICAgICBNZXRlb3IuX3NsZWVwRm9yTXMoMTAwKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoc2VsZi5fc3RvcHBlZClcbiAgICAgIHJldHVybjtcblxuICAgIHNlbGYuX3B1Ymxpc2hOZXdSZXN1bHRzKG5ld1Jlc3VsdHMsIG5ld0J1ZmZlcik7XG4gIH0sXG5cbiAgLy8gVHJhbnNpdGlvbnMgdG8gUVVFUllJTkcgYW5kIHJ1bnMgYW5vdGhlciBxdWVyeSwgb3IgKGlmIGFscmVhZHkgaW4gUVVFUllJTkcpXG4gIC8vIGVuc3VyZXMgdGhhdCB3ZSB3aWxsIHF1ZXJ5IGFnYWluIGxhdGVyLlxuICAvL1xuICAvLyBUaGlzIGZ1bmN0aW9uIG1heSBub3QgYmxvY2ssIGJlY2F1c2UgaXQgaXMgY2FsbGVkIGZyb20gYW4gb3Bsb2cgZW50cnlcbiAgLy8gaGFuZGxlci4gSG93ZXZlciwgaWYgd2Ugd2VyZSBub3QgYWxyZWFkeSBpbiB0aGUgUVVFUllJTkcgcGhhc2UsIGl0IHRocm93c1xuICAvLyBhbiBleGNlcHRpb24gdGhhdCBpcyBjYXVnaHQgYnkgdGhlIGNsb3Nlc3Qgc3Vycm91bmRpbmdcbiAgLy8gZmluaXNoSWZOZWVkVG9Qb2xsUXVlcnkgY2FsbDsgdGhpcyBlbnN1cmVzIHRoYXQgd2UgZG9uJ3QgY29udGludWUgcnVubmluZ1xuICAvLyBjbG9zZSB0aGF0IHdhcyBkZXNpZ25lZCBmb3IgYW5vdGhlciBwaGFzZSBpbnNpZGUgUEhBU0UuUVVFUllJTkcuXG4gIC8vXG4gIC8vIChJdCdzIGFsc28gbmVjZXNzYXJ5IHdoZW5ldmVyIGxvZ2ljIGluIHRoaXMgZmlsZSB5aWVsZHMgdG8gY2hlY2sgdGhhdCBvdGhlclxuICAvLyBwaGFzZXMgaGF2ZW4ndCBwdXQgdXMgaW50byBRVUVSWUlORyBtb2RlLCB0aG91Z2g7IGVnLFxuICAvLyBfZmV0Y2hNb2RpZmllZERvY3VtZW50cyBkb2VzIHRoaXMuKVxuICBfbmVlZFRvUG9sbFF1ZXJ5OiBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIE1ldGVvci5fbm9ZaWVsZHNBbGxvd2VkKGZ1bmN0aW9uICgpIHtcbiAgICAgIGlmIChzZWxmLl9zdG9wcGVkKVxuICAgICAgICByZXR1cm47XG5cbiAgICAgIC8vIElmIHdlJ3JlIG5vdCBhbHJlYWR5IGluIHRoZSBtaWRkbGUgb2YgYSBxdWVyeSwgd2UgY2FuIHF1ZXJ5IG5vd1xuICAgICAgLy8gKHBvc3NpYmx5IHBhdXNpbmcgRkVUQ0hJTkcpLlxuICAgICAgaWYgKHNlbGYuX3BoYXNlICE9PSBQSEFTRS5RVUVSWUlORykge1xuICAgICAgICBzZWxmLl9wb2xsUXVlcnkoKTtcbiAgICAgICAgdGhyb3cgbmV3IFN3aXRjaGVkVG9RdWVyeTtcbiAgICAgIH1cblxuICAgICAgLy8gV2UncmUgY3VycmVudGx5IGluIFFVRVJZSU5HLiBTZXQgYSBmbGFnIHRvIGVuc3VyZSB0aGF0IHdlIHJ1biBhbm90aGVyXG4gICAgICAvLyBxdWVyeSB3aGVuIHdlJ3JlIGRvbmUuXG4gICAgICBzZWxmLl9yZXF1ZXJ5V2hlbkRvbmVUaGlzUXVlcnkgPSB0cnVlO1xuICAgIH0pO1xuICB9LFxuXG4gIC8vIFlpZWxkcyFcbiAgX2RvbmVRdWVyeWluZzogZnVuY3Rpb24gKCkge1xuICAgIHZhciBzZWxmID0gdGhpcztcblxuICAgIGlmIChzZWxmLl9zdG9wcGVkKVxuICAgICAgcmV0dXJuO1xuICAgIHNlbGYuX21vbmdvSGFuZGxlLl9vcGxvZ0hhbmRsZS53YWl0VW50aWxDYXVnaHRVcCgpOyAgLy8geWllbGRzXG4gICAgaWYgKHNlbGYuX3N0b3BwZWQpXG4gICAgICByZXR1cm47XG4gICAgaWYgKHNlbGYuX3BoYXNlICE9PSBQSEFTRS5RVUVSWUlORylcbiAgICAgIHRocm93IEVycm9yKFwiUGhhc2UgdW5leHBlY3RlZGx5IFwiICsgc2VsZi5fcGhhc2UpO1xuXG4gICAgTWV0ZW9yLl9ub1lpZWxkc0FsbG93ZWQoZnVuY3Rpb24gKCkge1xuICAgICAgaWYgKHNlbGYuX3JlcXVlcnlXaGVuRG9uZVRoaXNRdWVyeSkge1xuICAgICAgICBzZWxmLl9yZXF1ZXJ5V2hlbkRvbmVUaGlzUXVlcnkgPSBmYWxzZTtcbiAgICAgICAgc2VsZi5fcG9sbFF1ZXJ5KCk7XG4gICAgICB9IGVsc2UgaWYgKHNlbGYuX25lZWRUb0ZldGNoLmVtcHR5KCkpIHtcbiAgICAgICAgc2VsZi5fYmVTdGVhZHkoKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHNlbGYuX2ZldGNoTW9kaWZpZWREb2N1bWVudHMoKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfSxcblxuICBfY3Vyc29yRm9yUXVlcnk6IGZ1bmN0aW9uIChvcHRpb25zT3ZlcndyaXRlKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIHJldHVybiBNZXRlb3IuX25vWWllbGRzQWxsb3dlZChmdW5jdGlvbiAoKSB7XG4gICAgICAvLyBUaGUgcXVlcnkgd2UgcnVuIGlzIGFsbW9zdCB0aGUgc2FtZSBhcyB0aGUgY3Vyc29yIHdlIGFyZSBvYnNlcnZpbmcsXG4gICAgICAvLyB3aXRoIGEgZmV3IGNoYW5nZXMuIFdlIG5lZWQgdG8gcmVhZCBhbGwgdGhlIGZpZWxkcyB0aGF0IGFyZSByZWxldmFudCB0b1xuICAgICAgLy8gdGhlIHNlbGVjdG9yLCBub3QganVzdCB0aGUgZmllbGRzIHdlIGFyZSBnb2luZyB0byBwdWJsaXNoICh0aGF0J3MgdGhlXG4gICAgICAvLyBcInNoYXJlZFwiIHByb2plY3Rpb24pLiBBbmQgd2UgZG9uJ3Qgd2FudCB0byBhcHBseSBhbnkgdHJhbnNmb3JtIGluIHRoZVxuICAgICAgLy8gY3Vyc29yLCBiZWNhdXNlIG9ic2VydmVDaGFuZ2VzIHNob3VsZG4ndCB1c2UgdGhlIHRyYW5zZm9ybS5cbiAgICAgIHZhciBvcHRpb25zID0gXy5jbG9uZShzZWxmLl9jdXJzb3JEZXNjcmlwdGlvbi5vcHRpb25zKTtcblxuICAgICAgLy8gQWxsb3cgdGhlIGNhbGxlciB0byBtb2RpZnkgdGhlIG9wdGlvbnMuIFVzZWZ1bCB0byBzcGVjaWZ5IGRpZmZlcmVudFxuICAgICAgLy8gc2tpcCBhbmQgbGltaXQgdmFsdWVzLlxuICAgICAgXy5leHRlbmQob3B0aW9ucywgb3B0aW9uc092ZXJ3cml0ZSk7XG5cbiAgICAgIG9wdGlvbnMuZmllbGRzID0gc2VsZi5fc2hhcmVkUHJvamVjdGlvbjtcbiAgICAgIGRlbGV0ZSBvcHRpb25zLnRyYW5zZm9ybTtcbiAgICAgIC8vIFdlIGFyZSBOT1QgZGVlcCBjbG9uaW5nIGZpZWxkcyBvciBzZWxlY3RvciBoZXJlLCB3aGljaCBzaG91bGQgYmUgT0suXG4gICAgICB2YXIgZGVzY3JpcHRpb24gPSBuZXcgQ3Vyc29yRGVzY3JpcHRpb24oXG4gICAgICAgIHNlbGYuX2N1cnNvckRlc2NyaXB0aW9uLmNvbGxlY3Rpb25OYW1lLFxuICAgICAgICBzZWxmLl9jdXJzb3JEZXNjcmlwdGlvbi5zZWxlY3RvcixcbiAgICAgICAgb3B0aW9ucyk7XG4gICAgICByZXR1cm4gbmV3IEN1cnNvcihzZWxmLl9tb25nb0hhbmRsZSwgZGVzY3JpcHRpb24pO1xuICAgIH0pO1xuICB9LFxuXG5cbiAgLy8gUmVwbGFjZSBzZWxmLl9wdWJsaXNoZWQgd2l0aCBuZXdSZXN1bHRzIChib3RoIGFyZSBJZE1hcHMpLCBpbnZva2luZyBvYnNlcnZlXG4gIC8vIGNhbGxiYWNrcyBvbiB0aGUgbXVsdGlwbGV4ZXIuXG4gIC8vIFJlcGxhY2Ugc2VsZi5fdW5wdWJsaXNoZWRCdWZmZXIgd2l0aCBuZXdCdWZmZXIuXG4gIC8vXG4gIC8vIFhYWCBUaGlzIGlzIHZlcnkgc2ltaWxhciB0byBMb2NhbENvbGxlY3Rpb24uX2RpZmZRdWVyeVVub3JkZXJlZENoYW5nZXMuIFdlXG4gIC8vIHNob3VsZCByZWFsbHk6IChhKSBVbmlmeSBJZE1hcCBhbmQgT3JkZXJlZERpY3QgaW50byBVbm9yZGVyZWQvT3JkZXJlZERpY3RcbiAgLy8gKGIpIFJld3JpdGUgZGlmZi5qcyB0byB1c2UgdGhlc2UgY2xhc3NlcyBpbnN0ZWFkIG9mIGFycmF5cyBhbmQgb2JqZWN0cy5cbiAgX3B1Ymxpc2hOZXdSZXN1bHRzOiBmdW5jdGlvbiAobmV3UmVzdWx0cywgbmV3QnVmZmVyKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIE1ldGVvci5fbm9ZaWVsZHNBbGxvd2VkKGZ1bmN0aW9uICgpIHtcblxuICAgICAgLy8gSWYgdGhlIHF1ZXJ5IGlzIGxpbWl0ZWQgYW5kIHRoZXJlIGlzIGEgYnVmZmVyLCBzaHV0IGRvd24gc28gaXQgZG9lc24ndFxuICAgICAgLy8gc3RheSBpbiBhIHdheS5cbiAgICAgIGlmIChzZWxmLl9saW1pdCkge1xuICAgICAgICBzZWxmLl91bnB1Ymxpc2hlZEJ1ZmZlci5jbGVhcigpO1xuICAgICAgfVxuXG4gICAgICAvLyBGaXJzdCByZW1vdmUgYW55dGhpbmcgdGhhdCdzIGdvbmUuIEJlIGNhcmVmdWwgbm90IHRvIG1vZGlmeVxuICAgICAgLy8gc2VsZi5fcHVibGlzaGVkIHdoaWxlIGl0ZXJhdGluZyBvdmVyIGl0LlxuICAgICAgdmFyIGlkc1RvUmVtb3ZlID0gW107XG4gICAgICBzZWxmLl9wdWJsaXNoZWQuZm9yRWFjaChmdW5jdGlvbiAoZG9jLCBpZCkge1xuICAgICAgICBpZiAoIW5ld1Jlc3VsdHMuaGFzKGlkKSlcbiAgICAgICAgICBpZHNUb1JlbW92ZS5wdXNoKGlkKTtcbiAgICAgIH0pO1xuICAgICAgXy5lYWNoKGlkc1RvUmVtb3ZlLCBmdW5jdGlvbiAoaWQpIHtcbiAgICAgICAgc2VsZi5fcmVtb3ZlUHVibGlzaGVkKGlkKTtcbiAgICAgIH0pO1xuXG4gICAgICAvLyBOb3cgZG8gYWRkcyBhbmQgY2hhbmdlcy5cbiAgICAgIC8vIElmIHNlbGYgaGFzIGEgYnVmZmVyIGFuZCBsaW1pdCwgdGhlIG5ldyBmZXRjaGVkIHJlc3VsdCB3aWxsIGJlXG4gICAgICAvLyBsaW1pdGVkIGNvcnJlY3RseSBhcyB0aGUgcXVlcnkgaGFzIHNvcnQgc3BlY2lmaWVyLlxuICAgICAgbmV3UmVzdWx0cy5mb3JFYWNoKGZ1bmN0aW9uIChkb2MsIGlkKSB7XG4gICAgICAgIHNlbGYuX2hhbmRsZURvYyhpZCwgZG9jKTtcbiAgICAgIH0pO1xuXG4gICAgICAvLyBTYW5pdHktY2hlY2sgdGhhdCBldmVyeXRoaW5nIHdlIHRyaWVkIHRvIHB1dCBpbnRvIF9wdWJsaXNoZWQgZW5kZWQgdXBcbiAgICAgIC8vIHRoZXJlLlxuICAgICAgLy8gWFhYIGlmIHRoaXMgaXMgc2xvdywgcmVtb3ZlIGl0IGxhdGVyXG4gICAgICBpZiAoc2VsZi5fcHVibGlzaGVkLnNpemUoKSAhPT0gbmV3UmVzdWx0cy5zaXplKCkpIHtcbiAgICAgICAgTWV0ZW9yLl9kZWJ1ZygnVGhlIE1vbmdvIHNlcnZlciBhbmQgdGhlIE1ldGVvciBxdWVyeSBkaXNhZ3JlZSBvbiBob3cgJyArXG4gICAgICAgICAgJ21hbnkgZG9jdW1lbnRzIG1hdGNoIHlvdXIgcXVlcnkuIEN1cnNvciBkZXNjcmlwdGlvbjogJyxcbiAgICAgICAgICBzZWxmLl9jdXJzb3JEZXNjcmlwdGlvbik7XG4gICAgICB9XG4gICAgICBcbiAgICAgIHNlbGYuX3B1Ymxpc2hlZC5mb3JFYWNoKGZ1bmN0aW9uIChkb2MsIGlkKSB7XG4gICAgICAgIGlmICghbmV3UmVzdWx0cy5oYXMoaWQpKVxuICAgICAgICAgIHRocm93IEVycm9yKFwiX3B1Ymxpc2hlZCBoYXMgYSBkb2MgdGhhdCBuZXdSZXN1bHRzIGRvZXNuJ3Q7IFwiICsgaWQpO1xuICAgICAgfSk7XG5cbiAgICAgIC8vIEZpbmFsbHksIHJlcGxhY2UgdGhlIGJ1ZmZlclxuICAgICAgbmV3QnVmZmVyLmZvckVhY2goZnVuY3Rpb24gKGRvYywgaWQpIHtcbiAgICAgICAgc2VsZi5fYWRkQnVmZmVyZWQoaWQsIGRvYyk7XG4gICAgICB9KTtcblxuICAgICAgc2VsZi5fc2FmZUFwcGVuZFRvQnVmZmVyID0gbmV3QnVmZmVyLnNpemUoKSA8IHNlbGYuX2xpbWl0O1xuICAgIH0pO1xuICB9LFxuXG4gIC8vIFRoaXMgc3RvcCBmdW5jdGlvbiBpcyBpbnZva2VkIGZyb20gdGhlIG9uU3RvcCBvZiB0aGUgT2JzZXJ2ZU11bHRpcGxleGVyLCBzb1xuICAvLyBpdCBzaG91bGRuJ3QgYWN0dWFsbHkgYmUgcG9zc2libGUgdG8gY2FsbCBpdCB1bnRpbCB0aGUgbXVsdGlwbGV4ZXIgaXNcbiAgLy8gcmVhZHkuXG4gIC8vXG4gIC8vIEl0J3MgaW1wb3J0YW50IHRvIGNoZWNrIHNlbGYuX3N0b3BwZWQgYWZ0ZXIgZXZlcnkgY2FsbCBpbiB0aGlzIGZpbGUgdGhhdFxuICAvLyBjYW4geWllbGQhXG4gIHN0b3A6IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgaWYgKHNlbGYuX3N0b3BwZWQpXG4gICAgICByZXR1cm47XG4gICAgc2VsZi5fc3RvcHBlZCA9IHRydWU7XG4gICAgXy5lYWNoKHNlbGYuX3N0b3BIYW5kbGVzLCBmdW5jdGlvbiAoaGFuZGxlKSB7XG4gICAgICBoYW5kbGUuc3RvcCgpO1xuICAgIH0pO1xuXG4gICAgLy8gTm90ZTogd2UgKmRvbid0KiB1c2UgbXVsdGlwbGV4ZXIub25GbHVzaCBoZXJlIGJlY2F1c2UgdGhpcyBzdG9wXG4gICAgLy8gY2FsbGJhY2sgaXMgYWN0dWFsbHkgaW52b2tlZCBieSB0aGUgbXVsdGlwbGV4ZXIgaXRzZWxmIHdoZW4gaXQgaGFzXG4gICAgLy8gZGV0ZXJtaW5lZCB0aGF0IHRoZXJlIGFyZSBubyBoYW5kbGVzIGxlZnQuIFNvIG5vdGhpbmcgaXMgYWN0dWFsbHkgZ29pbmdcbiAgICAvLyB0byBnZXQgZmx1c2hlZCAoYW5kIGl0J3MgcHJvYmFibHkgbm90IHZhbGlkIHRvIGNhbGwgbWV0aG9kcyBvbiB0aGVcbiAgICAvLyBkeWluZyBtdWx0aXBsZXhlcikuXG4gICAgXy5lYWNoKHNlbGYuX3dyaXRlc1RvQ29tbWl0V2hlbldlUmVhY2hTdGVhZHksIGZ1bmN0aW9uICh3KSB7XG4gICAgICB3LmNvbW1pdHRlZCgpOyAgLy8gbWF5YmUgeWllbGRzP1xuICAgIH0pO1xuICAgIHNlbGYuX3dyaXRlc1RvQ29tbWl0V2hlbldlUmVhY2hTdGVhZHkgPSBudWxsO1xuXG4gICAgLy8gUHJvYWN0aXZlbHkgZHJvcCByZWZlcmVuY2VzIHRvIHBvdGVudGlhbGx5IGJpZyB0aGluZ3MuXG4gICAgc2VsZi5fcHVibGlzaGVkID0gbnVsbDtcbiAgICBzZWxmLl91bnB1Ymxpc2hlZEJ1ZmZlciA9IG51bGw7XG4gICAgc2VsZi5fbmVlZFRvRmV0Y2ggPSBudWxsO1xuICAgIHNlbGYuX2N1cnJlbnRseUZldGNoaW5nID0gbnVsbDtcbiAgICBzZWxmLl9vcGxvZ0VudHJ5SGFuZGxlID0gbnVsbDtcbiAgICBzZWxmLl9saXN0ZW5lcnNIYW5kbGUgPSBudWxsO1xuXG4gICAgUGFja2FnZVsnZmFjdHMtYmFzZSddICYmIFBhY2thZ2VbJ2ZhY3RzLWJhc2UnXS5GYWN0cy5pbmNyZW1lbnRTZXJ2ZXJGYWN0KFxuICAgICAgXCJtb25nby1saXZlZGF0YVwiLCBcIm9ic2VydmUtZHJpdmVycy1vcGxvZ1wiLCAtMSk7XG4gIH0sXG5cbiAgX3JlZ2lzdGVyUGhhc2VDaGFuZ2U6IGZ1bmN0aW9uIChwaGFzZSkge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICBNZXRlb3IuX25vWWllbGRzQWxsb3dlZChmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgbm93ID0gbmV3IERhdGU7XG5cbiAgICAgIGlmIChzZWxmLl9waGFzZSkge1xuICAgICAgICB2YXIgdGltZURpZmYgPSBub3cgLSBzZWxmLl9waGFzZVN0YXJ0VGltZTtcbiAgICAgICAgUGFja2FnZVsnZmFjdHMtYmFzZSddICYmIFBhY2thZ2VbJ2ZhY3RzLWJhc2UnXS5GYWN0cy5pbmNyZW1lbnRTZXJ2ZXJGYWN0KFxuICAgICAgICAgIFwibW9uZ28tbGl2ZWRhdGFcIiwgXCJ0aW1lLXNwZW50LWluLVwiICsgc2VsZi5fcGhhc2UgKyBcIi1waGFzZVwiLCB0aW1lRGlmZik7XG4gICAgICB9XG5cbiAgICAgIHNlbGYuX3BoYXNlID0gcGhhc2U7XG4gICAgICBzZWxmLl9waGFzZVN0YXJ0VGltZSA9IG5vdztcbiAgICB9KTtcbiAgfVxufSk7XG5cbi8vIERvZXMgb3VyIG9wbG9nIHRhaWxpbmcgY29kZSBzdXBwb3J0IHRoaXMgY3Vyc29yPyBGb3Igbm93LCB3ZSBhcmUgYmVpbmcgdmVyeVxuLy8gY29uc2VydmF0aXZlIGFuZCBhbGxvd2luZyBvbmx5IHNpbXBsZSBxdWVyaWVzIHdpdGggc2ltcGxlIG9wdGlvbnMuXG4vLyAoVGhpcyBpcyBhIFwic3RhdGljIG1ldGhvZFwiLilcbk9wbG9nT2JzZXJ2ZURyaXZlci5jdXJzb3JTdXBwb3J0ZWQgPSBmdW5jdGlvbiAoY3Vyc29yRGVzY3JpcHRpb24sIG1hdGNoZXIpIHtcbiAgLy8gRmlyc3QsIGNoZWNrIHRoZSBvcHRpb25zLlxuICB2YXIgb3B0aW9ucyA9IGN1cnNvckRlc2NyaXB0aW9uLm9wdGlvbnM7XG5cbiAgLy8gRGlkIHRoZSB1c2VyIHNheSBubyBleHBsaWNpdGx5P1xuICAvLyB1bmRlcnNjb3JlZCB2ZXJzaW9uIG9mIHRoZSBvcHRpb24gaXMgQ09NUEFUIHdpdGggMS4yXG4gIGlmIChvcHRpb25zLmRpc2FibGVPcGxvZyB8fCBvcHRpb25zLl9kaXNhYmxlT3Bsb2cpXG4gICAgcmV0dXJuIGZhbHNlO1xuXG4gIC8vIHNraXAgaXMgbm90IHN1cHBvcnRlZDogdG8gc3VwcG9ydCBpdCB3ZSB3b3VsZCBuZWVkIHRvIGtlZXAgdHJhY2sgb2YgYWxsXG4gIC8vIFwic2tpcHBlZFwiIGRvY3VtZW50cyBvciBhdCBsZWFzdCB0aGVpciBpZHMuXG4gIC8vIGxpbWl0IHcvbyBhIHNvcnQgc3BlY2lmaWVyIGlzIG5vdCBzdXBwb3J0ZWQ6IGN1cnJlbnQgaW1wbGVtZW50YXRpb24gbmVlZHMgYVxuICAvLyBkZXRlcm1pbmlzdGljIHdheSB0byBvcmRlciBkb2N1bWVudHMuXG4gIGlmIChvcHRpb25zLnNraXAgfHwgKG9wdGlvbnMubGltaXQgJiYgIW9wdGlvbnMuc29ydCkpIHJldHVybiBmYWxzZTtcblxuICAvLyBJZiBhIGZpZWxkcyBwcm9qZWN0aW9uIG9wdGlvbiBpcyBnaXZlbiBjaGVjayBpZiBpdCBpcyBzdXBwb3J0ZWQgYnlcbiAgLy8gbWluaW1vbmdvIChzb21lIG9wZXJhdG9ycyBhcmUgbm90IHN1cHBvcnRlZCkuXG4gIGNvbnN0IGZpZWxkcyA9IG9wdGlvbnMuZmllbGRzIHx8IG9wdGlvbnMucHJvamVjdGlvbjtcbiAgaWYgKGZpZWxkcykge1xuICAgIHRyeSB7XG4gICAgICBMb2NhbENvbGxlY3Rpb24uX2NoZWNrU3VwcG9ydGVkUHJvamVjdGlvbihmaWVsZHMpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGlmIChlLm5hbWUgPT09IFwiTWluaW1vbmdvRXJyb3JcIikge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBlO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIFdlIGRvbid0IGFsbG93IHRoZSBmb2xsb3dpbmcgc2VsZWN0b3JzOlxuICAvLyAgIC0gJHdoZXJlIChub3QgY29uZmlkZW50IHRoYXQgd2UgcHJvdmlkZSB0aGUgc2FtZSBKUyBlbnZpcm9ubWVudFxuICAvLyAgICAgICAgICAgICBhcyBNb25nbywgYW5kIGNhbiB5aWVsZCEpXG4gIC8vICAgLSAkbmVhciAoaGFzIFwiaW50ZXJlc3RpbmdcIiBwcm9wZXJ0aWVzIGluIE1vbmdvREIsIGxpa2UgdGhlIHBvc3NpYmlsaXR5XG4gIC8vICAgICAgICAgICAgb2YgcmV0dXJuaW5nIGFuIElEIG11bHRpcGxlIHRpbWVzLCB0aG91Z2ggZXZlbiBwb2xsaW5nIG1heWJlXG4gIC8vICAgICAgICAgICAgaGF2ZSBhIGJ1ZyB0aGVyZSlcbiAgLy8gICAgICAgICAgIFhYWDogb25jZSB3ZSBzdXBwb3J0IGl0LCB3ZSB3b3VsZCBuZWVkIHRvIHRoaW5rIG1vcmUgb24gaG93IHdlXG4gIC8vICAgICAgICAgICBpbml0aWFsaXplIHRoZSBjb21wYXJhdG9ycyB3aGVuIHdlIGNyZWF0ZSB0aGUgZHJpdmVyLlxuICByZXR1cm4gIW1hdGNoZXIuaGFzV2hlcmUoKSAmJiAhbWF0Y2hlci5oYXNHZW9RdWVyeSgpO1xufTtcblxudmFyIG1vZGlmaWVyQ2FuQmVEaXJlY3RseUFwcGxpZWQgPSBmdW5jdGlvbiAobW9kaWZpZXIpIHtcbiAgcmV0dXJuIF8uYWxsKG1vZGlmaWVyLCBmdW5jdGlvbiAoZmllbGRzLCBvcGVyYXRpb24pIHtcbiAgICByZXR1cm4gXy5hbGwoZmllbGRzLCBmdW5jdGlvbiAodmFsdWUsIGZpZWxkKSB7XG4gICAgICByZXR1cm4gIS9FSlNPTlxcJC8udGVzdChmaWVsZCk7XG4gICAgfSk7XG4gIH0pO1xufTtcblxuTW9uZ29JbnRlcm5hbHMuT3Bsb2dPYnNlcnZlRHJpdmVyID0gT3Bsb2dPYnNlcnZlRHJpdmVyO1xuIiwiLy8gQ29udmVydGVyIG9mIHRoZSBuZXcgTW9uZ29EQiBPcGxvZyBmb3JtYXQgKD49NS4wKSB0byB0aGUgb25lIHRoYXQgTWV0ZW9yXG4vLyBoYW5kbGVzIHdlbGwsIGkuZS4sIGAkc2V0YCBhbmQgYCR1bnNldGAuIFRoZSBuZXcgZm9ybWF0IGlzIGNvbXBsZXRlbHkgbmV3LFxuLy8gYW5kIGxvb2tzIGFzIGZvbGxvd3M6XG4vL1xuLy8gICB7ICR2OiAyLCBkaWZmOiBEaWZmIH1cbi8vXG4vLyB3aGVyZSBgRGlmZmAgaXMgYSByZWN1cnNpdmUgc3RydWN0dXJlOlxuLy9cbi8vICAge1xuLy8gICAgIC8vIE5lc3RlZCB1cGRhdGVzIChzb21ldGltZXMgYWxzbyByZXByZXNlbnRlZCB3aXRoIGFuIHMtZmllbGQpLlxuLy8gICAgIC8vIEV4YW1wbGU6IGB7ICRzZXQ6IHsgJ2Zvby5iYXInOiAxIH0gfWAuXG4vLyAgICAgaTogeyA8a2V5PjogPHZhbHVlPiwgLi4uIH0sXG4vL1xuLy8gICAgIC8vIFRvcC1sZXZlbCB1cGRhdGVzLlxuLy8gICAgIC8vIEV4YW1wbGU6IGB7ICRzZXQ6IHsgZm9vOiB7IGJhcjogMSB9IH0gfWAuXG4vLyAgICAgdTogeyA8a2V5PjogPHZhbHVlPiwgLi4uIH0sXG4vL1xuLy8gICAgIC8vIFVuc2V0cy5cbi8vICAgICAvLyBFeGFtcGxlOiBgeyAkdW5zZXQ6IHsgZm9vOiAnJyB9IH1gLlxuLy8gICAgIGQ6IHsgPGtleT46IGZhbHNlLCAuLi4gfSxcbi8vXG4vLyAgICAgLy8gQXJyYXkgb3BlcmF0aW9ucy5cbi8vICAgICAvLyBFeGFtcGxlOiBgeyAkcHVzaDogeyBmb286ICdiYXInIH0gfWAuXG4vLyAgICAgczxrZXk+OiB7IGE6IHRydWUsIHU8aW5kZXg+OiA8dmFsdWU+LCAuLi4gfSxcbi8vICAgICAuLi5cbi8vXG4vLyAgICAgLy8gTmVzdGVkIG9wZXJhdGlvbnMgKHNvbWV0aW1lcyBhbHNvIHJlcHJlc2VudGVkIGluIHRoZSBgaWAgZmllbGQpLlxuLy8gICAgIC8vIEV4YW1wbGU6IGB7ICRzZXQ6IHsgJ2Zvby5iYXInOiAxIH0gfWAuXG4vLyAgICAgczxrZXk+OiBEaWZmLFxuLy8gICAgIC4uLlxuLy8gICB9XG4vL1xuLy8gKGFsbCBmaWVsZHMgYXJlIG9wdGlvbmFsKS5cblxuZnVuY3Rpb24gam9pbihwcmVmaXgsIGtleSkge1xuICByZXR1cm4gcHJlZml4ID8gYCR7cHJlZml4fS4ke2tleX1gIDoga2V5O1xufVxuXG5jb25zdCBhcnJheU9wZXJhdG9yS2V5UmVnZXggPSAvXihhfFtzdV1cXGQrKSQvO1xuXG5mdW5jdGlvbiBpc0FycmF5T3BlcmF0b3JLZXkoZmllbGQpIHtcbiAgcmV0dXJuIGFycmF5T3BlcmF0b3JLZXlSZWdleC50ZXN0KGZpZWxkKTtcbn1cblxuZnVuY3Rpb24gaXNBcnJheU9wZXJhdG9yKG9wZXJhdG9yKSB7XG4gIHJldHVybiBvcGVyYXRvci5hID09PSB0cnVlICYmIE9iamVjdC5rZXlzKG9wZXJhdG9yKS5ldmVyeShpc0FycmF5T3BlcmF0b3JLZXkpO1xufVxuXG5mdW5jdGlvbiBmbGF0dGVuT2JqZWN0SW50byh0YXJnZXQsIHNvdXJjZSwgcHJlZml4KSB7XG4gIGlmIChBcnJheS5pc0FycmF5KHNvdXJjZSkgfHwgdHlwZW9mIHNvdXJjZSAhPT0gJ29iamVjdCcgfHwgc291cmNlID09PSBudWxsKSB7XG4gICAgdGFyZ2V0W3ByZWZpeF0gPSBzb3VyY2U7XG4gIH0gZWxzZSB7XG4gICAgY29uc3QgZW50cmllcyA9IE9iamVjdC5lbnRyaWVzKHNvdXJjZSk7XG4gICAgaWYgKGVudHJpZXMubGVuZ3RoKSB7XG4gICAgICBlbnRyaWVzLmZvckVhY2goKFtrZXksIHZhbHVlXSkgPT4ge1xuICAgICAgICBmbGF0dGVuT2JqZWN0SW50byh0YXJnZXQsIHZhbHVlLCBqb2luKHByZWZpeCwga2V5KSk7XG4gICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGFyZ2V0W3ByZWZpeF0gPSBzb3VyY2U7XG4gICAgfVxuICB9XG59XG5cbmNvbnN0IGxvZ0RlYnVnTWVzc2FnZXMgPSAhIXByb2Nlc3MuZW52Lk9QTE9HX0NPTlZFUlRFUl9ERUJVRztcblxuZnVuY3Rpb24gY29udmVydE9wbG9nRGlmZihvcGxvZ0VudHJ5LCBkaWZmLCBwcmVmaXgpIHtcbiAgaWYgKGxvZ0RlYnVnTWVzc2FnZXMpIHtcbiAgICBjb25zb2xlLmxvZyhgY29udmVydE9wbG9nRGlmZigke0pTT04uc3RyaW5naWZ5KG9wbG9nRW50cnkpfSwgJHtKU09OLnN0cmluZ2lmeShkaWZmKX0sICR7SlNPTi5zdHJpbmdpZnkocHJlZml4KX0pYCk7XG4gIH1cblxuICBPYmplY3QuZW50cmllcyhkaWZmKS5mb3JFYWNoKChbZGlmZktleSwgdmFsdWVdKSA9PiB7XG4gICAgaWYgKGRpZmZLZXkgPT09ICdkJykge1xuICAgICAgLy8gSGFuZGxlIGAkdW5zZXRgcy5cbiAgICAgIG9wbG9nRW50cnkuJHVuc2V0ID8/PSB7fTtcbiAgICAgIE9iamVjdC5rZXlzKHZhbHVlKS5mb3JFYWNoKGtleSA9PiB7XG4gICAgICAgIG9wbG9nRW50cnkuJHVuc2V0W2pvaW4ocHJlZml4LCBrZXkpXSA9IHRydWU7XG4gICAgICB9KTtcbiAgICB9IGVsc2UgaWYgKGRpZmZLZXkgPT09ICdpJykge1xuICAgICAgLy8gSGFuZGxlIChwb3RlbnRpYWxseSkgbmVzdGVkIGAkc2V0YHMuXG4gICAgICBvcGxvZ0VudHJ5LiRzZXQgPz89IHt9O1xuICAgICAgZmxhdHRlbk9iamVjdEludG8ob3Bsb2dFbnRyeS4kc2V0LCB2YWx1ZSwgcHJlZml4KTtcbiAgICB9IGVsc2UgaWYgKGRpZmZLZXkgPT09ICd1Jykge1xuICAgICAgLy8gSGFuZGxlIGZsYXQgYCRzZXRgcy5cbiAgICAgIG9wbG9nRW50cnkuJHNldCA/Pz0ge307XG4gICAgICBPYmplY3QuZW50cmllcyh2YWx1ZSkuZm9yRWFjaCgoW2tleSwgdmFsdWVdKSA9PiB7XG4gICAgICAgIG9wbG9nRW50cnkuJHNldFtqb2luKHByZWZpeCwga2V5KV0gPSB2YWx1ZTtcbiAgICAgIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBIYW5kbGUgcy1maWVsZHMuXG4gICAgICBjb25zdCBrZXkgPSBkaWZmS2V5LnNsaWNlKDEpO1xuICAgICAgaWYgKGlzQXJyYXlPcGVyYXRvcih2YWx1ZSkpIHtcbiAgICAgICAgLy8gQXJyYXkgb3BlcmF0b3IuXG4gICAgICAgIE9iamVjdC5lbnRyaWVzKHZhbHVlKS5mb3JFYWNoKChbcG9zaXRpb24sIHZhbHVlXSkgPT4ge1xuICAgICAgICAgIGlmIChwb3NpdGlvbiA9PT0gJ2EnKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgY29uc3QgcG9zaXRpb25LZXkgPSBqb2luKGpvaW4ocHJlZml4LCBrZXkpLCBwb3NpdGlvbi5zbGljZSgxKSk7XG4gICAgICAgICAgaWYgKHBvc2l0aW9uWzBdID09PSAncycpIHtcbiAgICAgICAgICAgIGNvbnZlcnRPcGxvZ0RpZmYob3Bsb2dFbnRyeSwgdmFsdWUsIHBvc2l0aW9uS2V5KTtcbiAgICAgICAgICB9IGVsc2UgaWYgKHZhbHVlID09PSBudWxsKSB7XG4gICAgICAgICAgICBvcGxvZ0VudHJ5LiR1bnNldCA/Pz0ge307XG4gICAgICAgICAgICBvcGxvZ0VudHJ5LiR1bnNldFtwb3NpdGlvbktleV0gPSB0cnVlO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBvcGxvZ0VudHJ5LiRzZXQgPz89IHt9O1xuICAgICAgICAgICAgb3Bsb2dFbnRyeS4kc2V0W3Bvc2l0aW9uS2V5XSA9IHZhbHVlO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICB9IGVsc2UgaWYgKGtleSkge1xuICAgICAgICAvLyBOZXN0ZWQgb2JqZWN0LlxuICAgICAgICBjb252ZXJ0T3Bsb2dEaWZmKG9wbG9nRW50cnksIHZhbHVlLCBqb2luKHByZWZpeCwga2V5KSk7XG4gICAgICB9XG4gICAgfVxuICB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG9wbG9nVjJWMUNvbnZlcnRlcihvcGxvZ0VudHJ5KSB7XG4gIC8vIFBhc3MtdGhyb3VnaCB2MSBhbmQgKHByb2JhYmx5KSBpbnZhbGlkIGVudHJpZXMuXG4gIGlmIChvcGxvZ0VudHJ5LiR2ICE9PSAyIHx8ICFvcGxvZ0VudHJ5LmRpZmYpIHtcbiAgICByZXR1cm4gb3Bsb2dFbnRyeTtcbiAgfVxuXG4gIGNvbnN0IGNvbnZlcnRlZE9wbG9nRW50cnkgPSB7ICR2OiAyIH07XG4gIGNvbnZlcnRPcGxvZ0RpZmYoY29udmVydGVkT3Bsb2dFbnRyeSwgb3Bsb2dFbnRyeS5kaWZmLCAnJyk7XG4gIHJldHVybiBjb252ZXJ0ZWRPcGxvZ0VudHJ5O1xufVxuIiwiLy8gc2luZ2xldG9uXG5leHBvcnQgY29uc3QgTG9jYWxDb2xsZWN0aW9uRHJpdmVyID0gbmV3IChjbGFzcyBMb2NhbENvbGxlY3Rpb25Ecml2ZXIge1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICB0aGlzLm5vQ29ubkNvbGxlY3Rpb25zID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcbiAgfVxuXG4gIG9wZW4obmFtZSwgY29ubikge1xuICAgIGlmICghIG5hbWUpIHtcbiAgICAgIHJldHVybiBuZXcgTG9jYWxDb2xsZWN0aW9uO1xuICAgIH1cblxuICAgIGlmICghIGNvbm4pIHtcbiAgICAgIHJldHVybiBlbnN1cmVDb2xsZWN0aW9uKG5hbWUsIHRoaXMubm9Db25uQ29sbGVjdGlvbnMpO1xuICAgIH1cblxuICAgIGlmICghIGNvbm4uX21vbmdvX2xpdmVkYXRhX2NvbGxlY3Rpb25zKSB7XG4gICAgICBjb25uLl9tb25nb19saXZlZGF0YV9jb2xsZWN0aW9ucyA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG4gICAgfVxuXG4gICAgLy8gWFhYIGlzIHRoZXJlIGEgd2F5IHRvIGtlZXAgdHJhY2sgb2YgYSBjb25uZWN0aW9uJ3MgY29sbGVjdGlvbnMgd2l0aG91dFxuICAgIC8vIGRhbmdsaW5nIGl0IG9mZiB0aGUgY29ubmVjdGlvbiBvYmplY3Q/XG4gICAgcmV0dXJuIGVuc3VyZUNvbGxlY3Rpb24obmFtZSwgY29ubi5fbW9uZ29fbGl2ZWRhdGFfY29sbGVjdGlvbnMpO1xuICB9XG59KTtcblxuZnVuY3Rpb24gZW5zdXJlQ29sbGVjdGlvbihuYW1lLCBjb2xsZWN0aW9ucykge1xuICByZXR1cm4gKG5hbWUgaW4gY29sbGVjdGlvbnMpXG4gICAgPyBjb2xsZWN0aW9uc1tuYW1lXVxuICAgIDogY29sbGVjdGlvbnNbbmFtZV0gPSBuZXcgTG9jYWxDb2xsZWN0aW9uKG5hbWUpO1xufVxuIiwiaW1wb3J0IHtcbiAgQVNZTkNfQ09MTEVDVElPTl9NRVRIT0RTLFxuICBnZXRBc3luY01ldGhvZE5hbWVcbn0gZnJvbSBcIm1ldGVvci9taW5pbW9uZ28vY29uc3RhbnRzXCI7XG5cbk1vbmdvSW50ZXJuYWxzLlJlbW90ZUNvbGxlY3Rpb25Ecml2ZXIgPSBmdW5jdGlvbiAoXG4gIG1vbmdvX3VybCwgb3B0aW9ucykge1xuICB2YXIgc2VsZiA9IHRoaXM7XG4gIHNlbGYubW9uZ28gPSBuZXcgTW9uZ29Db25uZWN0aW9uKG1vbmdvX3VybCwgb3B0aW9ucyk7XG59O1xuXG5jb25zdCBSRU1PVEVfQ09MTEVDVElPTl9NRVRIT0RTID0gW1xuICAnX2NyZWF0ZUNhcHBlZENvbGxlY3Rpb24nLFxuICAnX2Ryb3BJbmRleCcsXG4gICdfZW5zdXJlSW5kZXgnLFxuICAnY3JlYXRlSW5kZXgnLFxuICAnY291bnREb2N1bWVudHMnLFxuICAnZHJvcENvbGxlY3Rpb24nLFxuICAnZXN0aW1hdGVkRG9jdW1lbnRDb3VudCcsXG4gICdmaW5kJyxcbiAgJ2ZpbmRPbmUnLFxuICAnaW5zZXJ0JyxcbiAgJ3Jhd0NvbGxlY3Rpb24nLFxuICAncmVtb3ZlJyxcbiAgJ3VwZGF0ZScsXG4gICd1cHNlcnQnLFxuXTtcblxuT2JqZWN0LmFzc2lnbihNb25nb0ludGVybmFscy5SZW1vdGVDb2xsZWN0aW9uRHJpdmVyLnByb3RvdHlwZSwge1xuICBvcGVuOiBmdW5jdGlvbiAobmFtZSkge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICB2YXIgcmV0ID0ge307XG4gICAgUkVNT1RFX0NPTExFQ1RJT05fTUVUSE9EUy5mb3JFYWNoKFxuICAgICAgZnVuY3Rpb24gKG0pIHtcbiAgICAgICAgcmV0W21dID0gXy5iaW5kKHNlbGYubW9uZ29bbV0sIHNlbGYubW9uZ28sIG5hbWUpO1xuXG4gICAgICAgIGlmICghQVNZTkNfQ09MTEVDVElPTl9NRVRIT0RTLmluY2x1ZGVzKG0pKSByZXR1cm47XG4gICAgICAgIGNvbnN0IGFzeW5jTWV0aG9kTmFtZSA9IGdldEFzeW5jTWV0aG9kTmFtZShtKTtcbiAgICAgICAgcmV0W2FzeW5jTWV0aG9kTmFtZV0gPSBmdW5jdGlvbiAoLi4uYXJncykge1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHJldFttXSguLi5hcmdzKSk7XG4gICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChlcnJvcik7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9KTtcbiAgICByZXR1cm4gcmV0O1xuICB9XG59KTtcblxuLy8gQ3JlYXRlIHRoZSBzaW5nbGV0b24gUmVtb3RlQ29sbGVjdGlvbkRyaXZlciBvbmx5IG9uIGRlbWFuZCwgc28gd2Vcbi8vIG9ubHkgcmVxdWlyZSBNb25nbyBjb25maWd1cmF0aW9uIGlmIGl0J3MgYWN0dWFsbHkgdXNlZCAoZWcsIG5vdCBpZlxuLy8geW91J3JlIG9ubHkgdHJ5aW5nIHRvIHJlY2VpdmUgZGF0YSBmcm9tIGEgcmVtb3RlIEREUCBzZXJ2ZXIuKVxuTW9uZ29JbnRlcm5hbHMuZGVmYXVsdFJlbW90ZUNvbGxlY3Rpb25Ecml2ZXIgPSBfLm9uY2UoZnVuY3Rpb24gKCkge1xuICB2YXIgY29ubmVjdGlvbk9wdGlvbnMgPSB7fTtcblxuICB2YXIgbW9uZ29VcmwgPSBwcm9jZXNzLmVudi5NT05HT19VUkw7XG5cbiAgaWYgKHByb2Nlc3MuZW52Lk1PTkdPX09QTE9HX1VSTCkge1xuICAgIGNvbm5lY3Rpb25PcHRpb25zLm9wbG9nVXJsID0gcHJvY2Vzcy5lbnYuTU9OR09fT1BMT0dfVVJMO1xuICB9XG5cbiAgaWYgKCEgbW9uZ29VcmwpXG4gICAgdGhyb3cgbmV3IEVycm9yKFwiTU9OR09fVVJMIG11c3QgYmUgc2V0IGluIGVudmlyb25tZW50XCIpO1xuXG4gIGNvbnN0IGRyaXZlciA9IG5ldyBNb25nb0ludGVybmFscy5SZW1vdGVDb2xsZWN0aW9uRHJpdmVyKG1vbmdvVXJsLCBjb25uZWN0aW9uT3B0aW9ucyk7XG5cbiAgLy8gQXMgbWFueSBkZXBsb3ltZW50IHRvb2xzLCBpbmNsdWRpbmcgTWV0ZW9yIFVwLCBzZW5kIHJlcXVlc3RzIHRvIHRoZSBhcHAgaW5cbiAgLy8gb3JkZXIgdG8gY29uZmlybSB0aGF0IHRoZSBkZXBsb3ltZW50IGZpbmlzaGVkIHN1Y2Nlc3NmdWxseSwgaXQncyByZXF1aXJlZFxuICAvLyB0byBrbm93IGFib3V0IGEgZGF0YWJhc2UgY29ubmVjdGlvbiBwcm9ibGVtIGJlZm9yZSB0aGUgYXBwIHN0YXJ0cy4gRG9pbmcgc29cbiAgLy8gaW4gYSBgTWV0ZW9yLnN0YXJ0dXBgIGlzIGZpbmUsIGFzIHRoZSBgV2ViQXBwYCBoYW5kbGVzIHJlcXVlc3RzIG9ubHkgYWZ0ZXJcbiAgLy8gYWxsIGFyZSBmaW5pc2hlZC5cbiAgTWV0ZW9yLnN0YXJ0dXAoKCkgPT4ge1xuICAgIFByb21pc2UuYXdhaXQoZHJpdmVyLm1vbmdvLmNsaWVudC5jb25uZWN0KCkpO1xuICB9KTtcblxuICByZXR1cm4gZHJpdmVyO1xufSk7XG4iLCIvLyBvcHRpb25zLmNvbm5lY3Rpb24sIGlmIGdpdmVuLCBpcyBhIExpdmVkYXRhQ2xpZW50IG9yIExpdmVkYXRhU2VydmVyXG4vLyBYWFggcHJlc2VudGx5IHRoZXJlIGlzIG5vIHdheSB0byBkZXN0cm95L2NsZWFuIHVwIGEgQ29sbGVjdGlvblxuaW1wb3J0IHtcbiAgQVNZTkNfQ09MTEVDVElPTl9NRVRIT0RTLFxuICBnZXRBc3luY01ldGhvZE5hbWVcbn0gZnJvbSBcIm1ldGVvci9taW5pbW9uZ28vY29uc3RhbnRzXCI7XG5cbmltcG9ydCB7IG5vcm1hbGl6ZVByb2plY3Rpb24gfSBmcm9tIFwiLi9tb25nb191dGlsc1wiO1xuZXhwb3J0IGZ1bmN0aW9uIHdhcm5Vc2luZ09sZEFwaSAoXG4gICAgbWV0aG9kTmFtZSxcbiAgICBjb2xsZWN0aW9uTmFtZSxcbiAgICBpc0NhbGxlZEZyb21Bc3luY1xuICAgKXtcbiAgaWYgKFxuICAgIHByb2Nlc3MuZW52LldBUk5fV0hFTl9VU0lOR19PTERfQVBJICYmIC8vIGFsc28gZW5zdXJlcyBpdCBpcyBvbiB0aGUgc2VydmVyXG4gICAgIWlzQ2FsbGVkRnJvbUFzeW5jIC8vIG11c3QgYmUgdHJ1ZSBvdGhlcndpc2Ugd2Ugc2hvdWxkIGxvZ1xuICApIHtcbiAgIGlmIChjb2xsZWN0aW9uTmFtZSA9PT0gdW5kZWZpbmVkIHx8IGNvbGxlY3Rpb25OYW1lLmluY2x1ZGVzKCdvcGxvZycpKSByZXR1cm5cbiAgIGNvbnNvbGUud2FybihgXG4gICBcbiAgIENhbGxpbmcgbWV0aG9kICR7Y29sbGVjdGlvbk5hbWV9LiR7bWV0aG9kTmFtZX0gZnJvbSBvbGQgQVBJIG9uIHNlcnZlci5cbiAgIFRoaXMgbWV0aG9kIHdpbGwgYmUgcmVtb3ZlZCwgZnJvbSB0aGUgc2VydmVyLCBpbiB2ZXJzaW9uIDMuXG4gICBUcmFjZSBpcyBiZWxvdzpgKVxuICAgY29uc29sZS50cmFjZSgpXG4gfTtcbn1cbi8qKlxuICogQHN1bW1hcnkgTmFtZXNwYWNlIGZvciBNb25nb0RCLXJlbGF0ZWQgaXRlbXNcbiAqIEBuYW1lc3BhY2VcbiAqL1xuTW9uZ28gPSB7fTtcblxuLyoqXG4gKiBAc3VtbWFyeSBDb25zdHJ1Y3RvciBmb3IgYSBDb2xsZWN0aW9uXG4gKiBAbG9jdXMgQW55d2hlcmVcbiAqIEBpbnN0YW5jZW5hbWUgY29sbGVjdGlvblxuICogQGNsYXNzXG4gKiBAcGFyYW0ge1N0cmluZ30gbmFtZSBUaGUgbmFtZSBvZiB0aGUgY29sbGVjdGlvbi4gIElmIG51bGwsIGNyZWF0ZXMgYW4gdW5tYW5hZ2VkICh1bnN5bmNocm9uaXplZCkgbG9jYWwgY29sbGVjdGlvbi5cbiAqIEBwYXJhbSB7T2JqZWN0fSBbb3B0aW9uc11cbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zLmNvbm5lY3Rpb24gVGhlIHNlcnZlciBjb25uZWN0aW9uIHRoYXQgd2lsbCBtYW5hZ2UgdGhpcyBjb2xsZWN0aW9uLiBVc2VzIHRoZSBkZWZhdWx0IGNvbm5lY3Rpb24gaWYgbm90IHNwZWNpZmllZC4gIFBhc3MgdGhlIHJldHVybiB2YWx1ZSBvZiBjYWxsaW5nIFtgRERQLmNvbm5lY3RgXSgjZGRwX2Nvbm5lY3QpIHRvIHNwZWNpZnkgYSBkaWZmZXJlbnQgc2VydmVyLiBQYXNzIGBudWxsYCB0byBzcGVjaWZ5IG5vIGNvbm5lY3Rpb24uIFVubWFuYWdlZCAoYG5hbWVgIGlzIG51bGwpIGNvbGxlY3Rpb25zIGNhbm5vdCBzcGVjaWZ5IGEgY29ubmVjdGlvbi5cbiAqIEBwYXJhbSB7U3RyaW5nfSBvcHRpb25zLmlkR2VuZXJhdGlvbiBUaGUgbWV0aG9kIG9mIGdlbmVyYXRpbmcgdGhlIGBfaWRgIGZpZWxkcyBvZiBuZXcgZG9jdW1lbnRzIGluIHRoaXMgY29sbGVjdGlvbi4gIFBvc3NpYmxlIHZhbHVlczpcblxuIC0gKipgJ1NUUklORydgKio6IHJhbmRvbSBzdHJpbmdzXG4gLSAqKmAnTU9OR08nYCoqOiAgcmFuZG9tIFtgTW9uZ28uT2JqZWN0SURgXSgjbW9uZ29fb2JqZWN0X2lkKSB2YWx1ZXNcblxuVGhlIGRlZmF1bHQgaWQgZ2VuZXJhdGlvbiB0ZWNobmlxdWUgaXMgYCdTVFJJTkcnYC5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IG9wdGlvbnMudHJhbnNmb3JtIEFuIG9wdGlvbmFsIHRyYW5zZm9ybWF0aW9uIGZ1bmN0aW9uLiBEb2N1bWVudHMgd2lsbCBiZSBwYXNzZWQgdGhyb3VnaCB0aGlzIGZ1bmN0aW9uIGJlZm9yZSBiZWluZyByZXR1cm5lZCBmcm9tIGBmZXRjaGAgb3IgYGZpbmRPbmVgLCBhbmQgYmVmb3JlIGJlaW5nIHBhc3NlZCB0byBjYWxsYmFja3Mgb2YgYG9ic2VydmVgLCBgbWFwYCwgYGZvckVhY2hgLCBgYWxsb3dgLCBhbmQgYGRlbnlgLiBUcmFuc2Zvcm1zIGFyZSAqbm90KiBhcHBsaWVkIGZvciB0aGUgY2FsbGJhY2tzIG9mIGBvYnNlcnZlQ2hhbmdlc2Agb3IgdG8gY3Vyc29ycyByZXR1cm5lZCBmcm9tIHB1Ymxpc2ggZnVuY3Rpb25zLlxuICogQHBhcmFtIHtCb29sZWFufSBvcHRpb25zLmRlZmluZU11dGF0aW9uTWV0aG9kcyBTZXQgdG8gYGZhbHNlYCB0byBza2lwIHNldHRpbmcgdXAgdGhlIG11dGF0aW9uIG1ldGhvZHMgdGhhdCBlbmFibGUgaW5zZXJ0L3VwZGF0ZS9yZW1vdmUgZnJvbSBjbGllbnQgY29kZS4gRGVmYXVsdCBgdHJ1ZWAuXG4gKi9cbk1vbmdvLkNvbGxlY3Rpb24gPSBmdW5jdGlvbiBDb2xsZWN0aW9uKG5hbWUsIG9wdGlvbnMpIHtcbiAgaWYgKCFuYW1lICYmIG5hbWUgIT09IG51bGwpIHtcbiAgICBNZXRlb3IuX2RlYnVnKFxuICAgICAgJ1dhcm5pbmc6IGNyZWF0aW5nIGFub255bW91cyBjb2xsZWN0aW9uLiBJdCB3aWxsIG5vdCBiZSAnICtcbiAgICAgICAgJ3NhdmVkIG9yIHN5bmNocm9uaXplZCBvdmVyIHRoZSBuZXR3b3JrLiAoUGFzcyBudWxsIGZvciAnICtcbiAgICAgICAgJ3RoZSBjb2xsZWN0aW9uIG5hbWUgdG8gdHVybiBvZmYgdGhpcyB3YXJuaW5nLiknXG4gICAgKTtcbiAgICBuYW1lID0gbnVsbDtcbiAgfVxuXG4gIGlmIChuYW1lICE9PSBudWxsICYmIHR5cGVvZiBuYW1lICE9PSAnc3RyaW5nJykge1xuICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICdGaXJzdCBhcmd1bWVudCB0byBuZXcgTW9uZ28uQ29sbGVjdGlvbiBtdXN0IGJlIGEgc3RyaW5nIG9yIG51bGwnXG4gICAgKTtcbiAgfVxuXG4gIGlmIChvcHRpb25zICYmIG9wdGlvbnMubWV0aG9kcykge1xuICAgIC8vIEJhY2t3YXJkcyBjb21wYXRpYmlsaXR5IGhhY2sgd2l0aCBvcmlnaW5hbCBzaWduYXR1cmUgKHdoaWNoIHBhc3NlZFxuICAgIC8vIFwiY29ubmVjdGlvblwiIGRpcmVjdGx5IGluc3RlYWQgb2YgaW4gb3B0aW9ucy4gKENvbm5lY3Rpb25zIG11c3QgaGF2ZSBhIFwibWV0aG9kc1wiXG4gICAgLy8gbWV0aG9kLilcbiAgICAvLyBYWFggcmVtb3ZlIGJlZm9yZSAxLjBcbiAgICBvcHRpb25zID0geyBjb25uZWN0aW9uOiBvcHRpb25zIH07XG4gIH1cbiAgLy8gQmFja3dhcmRzIGNvbXBhdGliaWxpdHk6IFwiY29ubmVjdGlvblwiIHVzZWQgdG8gYmUgY2FsbGVkIFwibWFuYWdlclwiLlxuICBpZiAob3B0aW9ucyAmJiBvcHRpb25zLm1hbmFnZXIgJiYgIW9wdGlvbnMuY29ubmVjdGlvbikge1xuICAgIG9wdGlvbnMuY29ubmVjdGlvbiA9IG9wdGlvbnMubWFuYWdlcjtcbiAgfVxuXG4gIG9wdGlvbnMgPSB7XG4gICAgY29ubmVjdGlvbjogdW5kZWZpbmVkLFxuICAgIGlkR2VuZXJhdGlvbjogJ1NUUklORycsXG4gICAgdHJhbnNmb3JtOiBudWxsLFxuICAgIF9kcml2ZXI6IHVuZGVmaW5lZCxcbiAgICBfcHJldmVudEF1dG9wdWJsaXNoOiBmYWxzZSxcbiAgICAuLi5vcHRpb25zLFxuICB9O1xuXG4gIHN3aXRjaCAob3B0aW9ucy5pZEdlbmVyYXRpb24pIHtcbiAgICBjYXNlICdNT05HTyc6XG4gICAgICB0aGlzLl9tYWtlTmV3SUQgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIHNyYyA9IG5hbWVcbiAgICAgICAgICA/IEREUC5yYW5kb21TdHJlYW0oJy9jb2xsZWN0aW9uLycgKyBuYW1lKVxuICAgICAgICAgIDogUmFuZG9tLmluc2VjdXJlO1xuICAgICAgICByZXR1cm4gbmV3IE1vbmdvLk9iamVjdElEKHNyYy5oZXhTdHJpbmcoMjQpKTtcbiAgICAgIH07XG4gICAgICBicmVhaztcbiAgICBjYXNlICdTVFJJTkcnOlxuICAgIGRlZmF1bHQ6XG4gICAgICB0aGlzLl9tYWtlTmV3SUQgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIHNyYyA9IG5hbWVcbiAgICAgICAgICA/IEREUC5yYW5kb21TdHJlYW0oJy9jb2xsZWN0aW9uLycgKyBuYW1lKVxuICAgICAgICAgIDogUmFuZG9tLmluc2VjdXJlO1xuICAgICAgICByZXR1cm4gc3JjLmlkKCk7XG4gICAgICB9O1xuICAgICAgYnJlYWs7XG4gIH1cblxuICB0aGlzLl90cmFuc2Zvcm0gPSBMb2NhbENvbGxlY3Rpb24ud3JhcFRyYW5zZm9ybShvcHRpb25zLnRyYW5zZm9ybSk7XG5cbiAgaWYgKCFuYW1lIHx8IG9wdGlvbnMuY29ubmVjdGlvbiA9PT0gbnVsbClcbiAgICAvLyBub3RlOiBuYW1lbGVzcyBjb2xsZWN0aW9ucyBuZXZlciBoYXZlIGEgY29ubmVjdGlvblxuICAgIHRoaXMuX2Nvbm5lY3Rpb24gPSBudWxsO1xuICBlbHNlIGlmIChvcHRpb25zLmNvbm5lY3Rpb24pIHRoaXMuX2Nvbm5lY3Rpb24gPSBvcHRpb25zLmNvbm5lY3Rpb247XG4gIGVsc2UgaWYgKE1ldGVvci5pc0NsaWVudCkgdGhpcy5fY29ubmVjdGlvbiA9IE1ldGVvci5jb25uZWN0aW9uO1xuICBlbHNlIHRoaXMuX2Nvbm5lY3Rpb24gPSBNZXRlb3Iuc2VydmVyO1xuXG4gIGlmICghb3B0aW9ucy5fZHJpdmVyKSB7XG4gICAgLy8gWFhYIFRoaXMgY2hlY2sgYXNzdW1lcyB0aGF0IHdlYmFwcCBpcyBsb2FkZWQgc28gdGhhdCBNZXRlb3Iuc2VydmVyICE9PVxuICAgIC8vIG51bGwuIFdlIHNob3VsZCBmdWxseSBzdXBwb3J0IHRoZSBjYXNlIG9mIFwid2FudCB0byB1c2UgYSBNb25nby1iYWNrZWRcbiAgICAvLyBjb2xsZWN0aW9uIGZyb20gTm9kZSBjb2RlIHdpdGhvdXQgd2ViYXBwXCIsIGJ1dCB3ZSBkb24ndCB5ZXQuXG4gICAgLy8gI01ldGVvclNlcnZlck51bGxcbiAgICBpZiAoXG4gICAgICBuYW1lICYmXG4gICAgICB0aGlzLl9jb25uZWN0aW9uID09PSBNZXRlb3Iuc2VydmVyICYmXG4gICAgICB0eXBlb2YgTW9uZ29JbnRlcm5hbHMgIT09ICd1bmRlZmluZWQnICYmXG4gICAgICBNb25nb0ludGVybmFscy5kZWZhdWx0UmVtb3RlQ29sbGVjdGlvbkRyaXZlclxuICAgICkge1xuICAgICAgb3B0aW9ucy5fZHJpdmVyID0gTW9uZ29JbnRlcm5hbHMuZGVmYXVsdFJlbW90ZUNvbGxlY3Rpb25Ecml2ZXIoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc3QgeyBMb2NhbENvbGxlY3Rpb25Ecml2ZXIgfSA9IHJlcXVpcmUoJy4vbG9jYWxfY29sbGVjdGlvbl9kcml2ZXIuanMnKTtcbiAgICAgIG9wdGlvbnMuX2RyaXZlciA9IExvY2FsQ29sbGVjdGlvbkRyaXZlcjtcbiAgICB9XG4gIH1cblxuICB0aGlzLl9jb2xsZWN0aW9uID0gb3B0aW9ucy5fZHJpdmVyLm9wZW4obmFtZSwgdGhpcy5fY29ubmVjdGlvbik7XG4gIHRoaXMuX25hbWUgPSBuYW1lO1xuICB0aGlzLl9kcml2ZXIgPSBvcHRpb25zLl9kcml2ZXI7XG5cbiAgdGhpcy5fbWF5YmVTZXRVcFJlcGxpY2F0aW9uKG5hbWUsIG9wdGlvbnMpO1xuXG4gIC8vIFhYWCBkb24ndCBkZWZpbmUgdGhlc2UgdW50aWwgYWxsb3cgb3IgZGVueSBpcyBhY3R1YWxseSB1c2VkIGZvciB0aGlzXG4gIC8vIGNvbGxlY3Rpb24uIENvdWxkIGJlIGhhcmQgaWYgdGhlIHNlY3VyaXR5IHJ1bGVzIGFyZSBvbmx5IGRlZmluZWQgb24gdGhlXG4gIC8vIHNlcnZlci5cbiAgaWYgKG9wdGlvbnMuZGVmaW5lTXV0YXRpb25NZXRob2RzICE9PSBmYWxzZSkge1xuICAgIHRyeSB7XG4gICAgICB0aGlzLl9kZWZpbmVNdXRhdGlvbk1ldGhvZHMoe1xuICAgICAgICB1c2VFeGlzdGluZzogb3B0aW9ucy5fc3VwcHJlc3NTYW1lTmFtZUVycm9yID09PSB0cnVlLFxuICAgICAgfSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIC8vIFRocm93IGEgbW9yZSB1bmRlcnN0YW5kYWJsZSBlcnJvciBvbiB0aGUgc2VydmVyIGZvciBzYW1lIGNvbGxlY3Rpb24gbmFtZVxuICAgICAgaWYgKFxuICAgICAgICBlcnJvci5tZXNzYWdlID09PSBgQSBtZXRob2QgbmFtZWQgJy8ke25hbWV9L2luc2VydCcgaXMgYWxyZWFkeSBkZWZpbmVkYFxuICAgICAgKVxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFRoZXJlIGlzIGFscmVhZHkgYSBjb2xsZWN0aW9uIG5hbWVkIFwiJHtuYW1lfVwiYCk7XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9XG4gIH1cblxuICAvLyBhdXRvcHVibGlzaFxuICBpZiAoXG4gICAgUGFja2FnZS5hdXRvcHVibGlzaCAmJlxuICAgICFvcHRpb25zLl9wcmV2ZW50QXV0b3B1Ymxpc2ggJiZcbiAgICB0aGlzLl9jb25uZWN0aW9uICYmXG4gICAgdGhpcy5fY29ubmVjdGlvbi5wdWJsaXNoXG4gICkge1xuICAgIHRoaXMuX2Nvbm5lY3Rpb24ucHVibGlzaChudWxsLCAoKSA9PiB0aGlzLmZpbmQoKSwge1xuICAgICAgaXNfYXV0bzogdHJ1ZSxcbiAgICB9KTtcbiAgfVxufTtcblxuT2JqZWN0LmFzc2lnbihNb25nby5Db2xsZWN0aW9uLnByb3RvdHlwZSwge1xuICBfbWF5YmVTZXRVcFJlcGxpY2F0aW9uKG5hbWUsIHsgX3N1cHByZXNzU2FtZU5hbWVFcnJvciA9IGZhbHNlIH0pIHtcbiAgICBjb25zdCBzZWxmID0gdGhpcztcbiAgICBpZiAoIShzZWxmLl9jb25uZWN0aW9uICYmIHNlbGYuX2Nvbm5lY3Rpb24ucmVnaXN0ZXJTdG9yZSkpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBPSywgd2UncmUgZ29pbmcgdG8gYmUgYSBzbGF2ZSwgcmVwbGljYXRpbmcgc29tZSByZW1vdGVcbiAgICAvLyBkYXRhYmFzZSwgZXhjZXB0IHBvc3NpYmx5IHdpdGggc29tZSB0ZW1wb3JhcnkgZGl2ZXJnZW5jZSB3aGlsZVxuICAgIC8vIHdlIGhhdmUgdW5hY2tub3dsZWRnZWQgUlBDJ3MuXG4gICAgY29uc3Qgb2sgPSBzZWxmLl9jb25uZWN0aW9uLnJlZ2lzdGVyU3RvcmUobmFtZSwge1xuICAgICAgLy8gQ2FsbGVkIGF0IHRoZSBiZWdpbm5pbmcgb2YgYSBiYXRjaCBvZiB1cGRhdGVzLiBiYXRjaFNpemUgaXMgdGhlIG51bWJlclxuICAgICAgLy8gb2YgdXBkYXRlIGNhbGxzIHRvIGV4cGVjdC5cbiAgICAgIC8vXG4gICAgICAvLyBYWFggVGhpcyBpbnRlcmZhY2UgaXMgcHJldHR5IGphbmt5LiByZXNldCBwcm9iYWJseSBvdWdodCB0byBnbyBiYWNrIHRvXG4gICAgICAvLyBiZWluZyBpdHMgb3duIGZ1bmN0aW9uLCBhbmQgY2FsbGVycyBzaG91bGRuJ3QgaGF2ZSB0byBjYWxjdWxhdGVcbiAgICAgIC8vIGJhdGNoU2l6ZS4gVGhlIG9wdGltaXphdGlvbiBvZiBub3QgY2FsbGluZyBwYXVzZS9yZW1vdmUgc2hvdWxkIGJlXG4gICAgICAvLyBkZWxheWVkIHVudGlsIGxhdGVyOiB0aGUgZmlyc3QgY2FsbCB0byB1cGRhdGUoKSBzaG91bGQgYnVmZmVyIGl0c1xuICAgICAgLy8gbWVzc2FnZSwgYW5kIHRoZW4gd2UgY2FuIGVpdGhlciBkaXJlY3RseSBhcHBseSBpdCBhdCBlbmRVcGRhdGUgdGltZSBpZlxuICAgICAgLy8gaXQgd2FzIHRoZSBvbmx5IHVwZGF0ZSwgb3IgZG8gcGF1c2VPYnNlcnZlcnMvYXBwbHkvYXBwbHkgYXQgdGhlIG5leHRcbiAgICAgIC8vIHVwZGF0ZSgpIGlmIHRoZXJlJ3MgYW5vdGhlciBvbmUuXG4gICAgICBiZWdpblVwZGF0ZShiYXRjaFNpemUsIHJlc2V0KSB7XG4gICAgICAgIC8vIHBhdXNlIG9ic2VydmVycyBzbyB1c2VycyBkb24ndCBzZWUgZmxpY2tlciB3aGVuIHVwZGF0aW5nIHNldmVyYWxcbiAgICAgICAgLy8gb2JqZWN0cyBhdCBvbmNlIChpbmNsdWRpbmcgdGhlIHBvc3QtcmVjb25uZWN0IHJlc2V0LWFuZC1yZWFwcGx5XG4gICAgICAgIC8vIHN0YWdlKSwgYW5kIHNvIHRoYXQgYSByZS1zb3J0aW5nIG9mIGEgcXVlcnkgY2FuIHRha2UgYWR2YW50YWdlIG9mIHRoZVxuICAgICAgICAvLyBmdWxsIF9kaWZmUXVlcnkgbW92ZWQgY2FsY3VsYXRpb24gaW5zdGVhZCBvZiBhcHBseWluZyBjaGFuZ2Ugb25lIGF0IGFcbiAgICAgICAgLy8gdGltZS5cbiAgICAgICAgaWYgKGJhdGNoU2l6ZSA+IDEgfHwgcmVzZXQpIHNlbGYuX2NvbGxlY3Rpb24ucGF1c2VPYnNlcnZlcnMoKTtcblxuICAgICAgICBpZiAocmVzZXQpIHNlbGYuX2NvbGxlY3Rpb24ucmVtb3ZlKHt9KTtcbiAgICAgIH0sXG5cbiAgICAgIC8vIEFwcGx5IGFuIHVwZGF0ZS5cbiAgICAgIC8vIFhYWCBiZXR0ZXIgc3BlY2lmeSB0aGlzIGludGVyZmFjZSAobm90IGluIHRlcm1zIG9mIGEgd2lyZSBtZXNzYWdlKT9cbiAgICAgIHVwZGF0ZShtc2cpIHtcbiAgICAgICAgdmFyIG1vbmdvSWQgPSBNb25nb0lELmlkUGFyc2UobXNnLmlkKTtcbiAgICAgICAgdmFyIGRvYyA9IHNlbGYuX2NvbGxlY3Rpb24uX2RvY3MuZ2V0KG1vbmdvSWQpO1xuXG4gICAgICAgIC8vV2hlbiB0aGUgc2VydmVyJ3MgbWVyZ2Vib3ggaXMgZGlzYWJsZWQgZm9yIGEgY29sbGVjdGlvbiwgdGhlIGNsaWVudCBtdXN0IGdyYWNlZnVsbHkgaGFuZGxlIGl0IHdoZW46XG4gICAgICAgIC8vICpXZSByZWNlaXZlIGFuIGFkZGVkIG1lc3NhZ2UgZm9yIGEgZG9jdW1lbnQgdGhhdCBpcyBhbHJlYWR5IHRoZXJlLiBJbnN0ZWFkLCBpdCB3aWxsIGJlIGNoYW5nZWRcbiAgICAgICAgLy8gKldlIHJlZWl2ZSBhIGNoYW5nZSBtZXNzYWdlIGZvciBhIGRvY3VtZW50IHRoYXQgaXMgbm90IHRoZXJlLiBJbnN0ZWFkLCBpdCB3aWxsIGJlIGFkZGVkXG4gICAgICAgIC8vICpXZSByZWNlaXZlIGEgcmVtb3ZlZCBtZXNzc2FnZSBmb3IgYSBkb2N1bWVudCB0aGF0IGlzIG5vdCB0aGVyZS4gSW5zdGVhZCwgbm90aW5nIHdpbCBoYXBwZW4uXG5cbiAgICAgICAgLy9Db2RlIGlzIGRlcml2ZWQgZnJvbSBjbGllbnQtc2lkZSBjb2RlIG9yaWdpbmFsbHkgaW4gcGVlcmxpYnJhcnk6Y29udHJvbC1tZXJnZWJveFxuICAgICAgICAvL2h0dHBzOi8vZ2l0aHViLmNvbS9wZWVybGlicmFyeS9tZXRlb3ItY29udHJvbC1tZXJnZWJveC9ibG9iL21hc3Rlci9jbGllbnQuY29mZmVlXG5cbiAgICAgICAgLy9Gb3IgbW9yZSBpbmZvcm1hdGlvbiwgcmVmZXIgdG8gZGlzY3Vzc2lvbiBcIkluaXRpYWwgc3VwcG9ydCBmb3IgcHVibGljYXRpb24gc3RyYXRlZ2llcyBpbiBsaXZlZGF0YSBzZXJ2ZXJcIjpcbiAgICAgICAgLy9odHRwczovL2dpdGh1Yi5jb20vbWV0ZW9yL21ldGVvci9wdWxsLzExMTUxXG4gICAgICAgIGlmIChNZXRlb3IuaXNDbGllbnQpIHtcbiAgICAgICAgICBpZiAobXNnLm1zZyA9PT0gJ2FkZGVkJyAmJiBkb2MpIHtcbiAgICAgICAgICAgIG1zZy5tc2cgPSAnY2hhbmdlZCc7XG4gICAgICAgICAgfSBlbHNlIGlmIChtc2cubXNnID09PSAncmVtb3ZlZCcgJiYgIWRvYykge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH0gZWxzZSBpZiAobXNnLm1zZyA9PT0gJ2NoYW5nZWQnICYmICFkb2MpIHtcbiAgICAgICAgICAgIG1zZy5tc2cgPSAnYWRkZWQnO1xuICAgICAgICAgICAgX3JlZiA9IG1zZy5maWVsZHM7XG4gICAgICAgICAgICBmb3IgKGZpZWxkIGluIF9yZWYpIHtcbiAgICAgICAgICAgICAgdmFsdWUgPSBfcmVmW2ZpZWxkXTtcbiAgICAgICAgICAgICAgaWYgKHZhbHVlID09PSB2b2lkIDApIHtcbiAgICAgICAgICAgICAgICBkZWxldGUgbXNnLmZpZWxkc1tmaWVsZF07XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBJcyB0aGlzIGEgXCJyZXBsYWNlIHRoZSB3aG9sZSBkb2NcIiBtZXNzYWdlIGNvbWluZyBmcm9tIHRoZSBxdWllc2NlbmNlXG4gICAgICAgIC8vIG9mIG1ldGhvZCB3cml0ZXMgdG8gYW4gb2JqZWN0PyAoTm90ZSB0aGF0ICd1bmRlZmluZWQnIGlzIGEgdmFsaWRcbiAgICAgICAgLy8gdmFsdWUgbWVhbmluZyBcInJlbW92ZSBpdFwiLilcbiAgICAgICAgaWYgKG1zZy5tc2cgPT09ICdyZXBsYWNlJykge1xuICAgICAgICAgIHZhciByZXBsYWNlID0gbXNnLnJlcGxhY2U7XG4gICAgICAgICAgaWYgKCFyZXBsYWNlKSB7XG4gICAgICAgICAgICBpZiAoZG9jKSBzZWxmLl9jb2xsZWN0aW9uLnJlbW92ZShtb25nb0lkKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKCFkb2MpIHtcbiAgICAgICAgICAgIHNlbGYuX2NvbGxlY3Rpb24uaW5zZXJ0KHJlcGxhY2UpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBYWFggY2hlY2sgdGhhdCByZXBsYWNlIGhhcyBubyAkIG9wc1xuICAgICAgICAgICAgc2VsZi5fY29sbGVjdGlvbi51cGRhdGUobW9uZ29JZCwgcmVwbGFjZSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfSBlbHNlIGlmIChtc2cubXNnID09PSAnYWRkZWQnKSB7XG4gICAgICAgICAgaWYgKGRvYykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICAgICAgICAnRXhwZWN0ZWQgbm90IHRvIGZpbmQgYSBkb2N1bWVudCBhbHJlYWR5IHByZXNlbnQgZm9yIGFuIGFkZCdcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHNlbGYuX2NvbGxlY3Rpb24uaW5zZXJ0KHsgX2lkOiBtb25nb0lkLCAuLi5tc2cuZmllbGRzIH0pO1xuICAgICAgICB9IGVsc2UgaWYgKG1zZy5tc2cgPT09ICdyZW1vdmVkJykge1xuICAgICAgICAgIGlmICghZG9jKVxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICAgICAgICAnRXhwZWN0ZWQgdG8gZmluZCBhIGRvY3VtZW50IGFscmVhZHkgcHJlc2VudCBmb3IgcmVtb3ZlZCdcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgc2VsZi5fY29sbGVjdGlvbi5yZW1vdmUobW9uZ29JZCk7XG4gICAgICAgIH0gZWxzZSBpZiAobXNnLm1zZyA9PT0gJ2NoYW5nZWQnKSB7XG4gICAgICAgICAgaWYgKCFkb2MpIHRocm93IG5ldyBFcnJvcignRXhwZWN0ZWQgdG8gZmluZCBhIGRvY3VtZW50IHRvIGNoYW5nZScpO1xuICAgICAgICAgIGNvbnN0IGtleXMgPSBPYmplY3Qua2V5cyhtc2cuZmllbGRzKTtcbiAgICAgICAgICBpZiAoa2V5cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICB2YXIgbW9kaWZpZXIgPSB7fTtcbiAgICAgICAgICAgIGtleXMuZm9yRWFjaChrZXkgPT4ge1xuICAgICAgICAgICAgICBjb25zdCB2YWx1ZSA9IG1zZy5maWVsZHNba2V5XTtcbiAgICAgICAgICAgICAgaWYgKEVKU09OLmVxdWFscyhkb2Nba2V5XSwgdmFsdWUpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICAgICAgaWYgKCFtb2RpZmllci4kdW5zZXQpIHtcbiAgICAgICAgICAgICAgICAgIG1vZGlmaWVyLiR1bnNldCA9IHt9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBtb2RpZmllci4kdW5zZXRba2V5XSA9IDE7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgaWYgKCFtb2RpZmllci4kc2V0KSB7XG4gICAgICAgICAgICAgICAgICBtb2RpZmllci4kc2V0ID0ge307XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIG1vZGlmaWVyLiRzZXRba2V5XSA9IHZhbHVlO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIGlmIChPYmplY3Qua2V5cyhtb2RpZmllcikubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICBzZWxmLl9jb2xsZWN0aW9uLnVwZGF0ZShtb25nb0lkLCBtb2RpZmllcik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkkgZG9uJ3Qga25vdyBob3cgdG8gZGVhbCB3aXRoIHRoaXMgbWVzc2FnZVwiKTtcbiAgICAgICAgfVxuICAgICAgfSxcblxuICAgICAgLy8gQ2FsbGVkIGF0IHRoZSBlbmQgb2YgYSBiYXRjaCBvZiB1cGRhdGVzLlxuICAgICAgZW5kVXBkYXRlKCkge1xuICAgICAgICBzZWxmLl9jb2xsZWN0aW9uLnJlc3VtZU9ic2VydmVycygpO1xuICAgICAgfSxcblxuICAgICAgLy8gQ2FsbGVkIGFyb3VuZCBtZXRob2Qgc3R1YiBpbnZvY2F0aW9ucyB0byBjYXB0dXJlIHRoZSBvcmlnaW5hbCB2ZXJzaW9uc1xuICAgICAgLy8gb2YgbW9kaWZpZWQgZG9jdW1lbnRzLlxuICAgICAgc2F2ZU9yaWdpbmFscygpIHtcbiAgICAgICAgc2VsZi5fY29sbGVjdGlvbi5zYXZlT3JpZ2luYWxzKCk7XG4gICAgICB9LFxuICAgICAgcmV0cmlldmVPcmlnaW5hbHMoKSB7XG4gICAgICAgIHJldHVybiBzZWxmLl9jb2xsZWN0aW9uLnJldHJpZXZlT3JpZ2luYWxzKCk7XG4gICAgICB9LFxuXG4gICAgICAvLyBVc2VkIHRvIHByZXNlcnZlIGN1cnJlbnQgdmVyc2lvbnMgb2YgZG9jdW1lbnRzIGFjcm9zcyBhIHN0b3JlIHJlc2V0LlxuICAgICAgZ2V0RG9jKGlkKSB7XG4gICAgICAgIHJldHVybiBzZWxmLmZpbmRPbmUoaWQpO1xuICAgICAgfSxcblxuICAgICAgLy8gVG8gYmUgYWJsZSB0byBnZXQgYmFjayB0byB0aGUgY29sbGVjdGlvbiBmcm9tIHRoZSBzdG9yZS5cbiAgICAgIF9nZXRDb2xsZWN0aW9uKCkge1xuICAgICAgICByZXR1cm4gc2VsZjtcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBpZiAoIW9rKSB7XG4gICAgICBjb25zdCBtZXNzYWdlID0gYFRoZXJlIGlzIGFscmVhZHkgYSBjb2xsZWN0aW9uIG5hbWVkIFwiJHtuYW1lfVwiYDtcbiAgICAgIGlmIChfc3VwcHJlc3NTYW1lTmFtZUVycm9yID09PSB0cnVlKSB7XG4gICAgICAgIC8vIFhYWCBJbiB0aGVvcnkgd2UgZG8gbm90IGhhdmUgdG8gdGhyb3cgd2hlbiBgb2tgIGlzIGZhbHN5LiBUaGVcbiAgICAgICAgLy8gc3RvcmUgaXMgYWxyZWFkeSBkZWZpbmVkIGZvciB0aGlzIGNvbGxlY3Rpb24gbmFtZSwgYnV0IHRoaXNcbiAgICAgICAgLy8gd2lsbCBzaW1wbHkgYmUgYW5vdGhlciByZWZlcmVuY2UgdG8gaXQgYW5kIGV2ZXJ5dGhpbmcgc2hvdWxkXG4gICAgICAgIC8vIHdvcmsuIEhvd2V2ZXIsIHdlIGhhdmUgaGlzdG9yaWNhbGx5IHRocm93biBhbiBlcnJvciBoZXJlLCBzb1xuICAgICAgICAvLyBmb3Igbm93IHdlIHdpbGwgc2tpcCB0aGUgZXJyb3Igb25seSB3aGVuIF9zdXBwcmVzc1NhbWVOYW1lRXJyb3JcbiAgICAgICAgLy8gaXMgYHRydWVgLCBhbGxvd2luZyBwZW9wbGUgdG8gb3B0IGluIGFuZCBnaXZlIHRoaXMgc29tZSByZWFsXG4gICAgICAgIC8vIHdvcmxkIHRlc3RpbmcuXG4gICAgICAgIGNvbnNvbGUud2FybiA/IGNvbnNvbGUud2FybihtZXNzYWdlKSA6IGNvbnNvbGUubG9nKG1lc3NhZ2UpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKG1lc3NhZ2UpO1xuICAgICAgfVxuICAgIH1cbiAgfSxcblxuICAvLy9cbiAgLy8vIE1haW4gY29sbGVjdGlvbiBBUElcbiAgLy8vXG4gIC8qKlxuICAgKiBAc3VtbWFyeSBHZXRzIHRoZSBudW1iZXIgb2YgZG9jdW1lbnRzIG1hdGNoaW5nIHRoZSBmaWx0ZXIuIEZvciBhIGZhc3QgY291bnQgb2YgdGhlIHRvdGFsIGRvY3VtZW50cyBpbiBhIGNvbGxlY3Rpb24gc2VlIGBlc3RpbWF0ZWREb2N1bWVudENvdW50YC5cbiAgICogQGxvY3VzIEFueXdoZXJlXG4gICAqIEBtZXRob2QgY291bnREb2N1bWVudHNcbiAgICogQG1lbWJlcm9mIE1vbmdvLkNvbGxlY3Rpb25cbiAgICogQGluc3RhbmNlXG4gICAqIEBwYXJhbSB7TW9uZ29TZWxlY3Rvcn0gW3NlbGVjdG9yXSBBIHF1ZXJ5IGRlc2NyaWJpbmcgdGhlIGRvY3VtZW50cyB0byBjb3VudFxuICAgKiBAcGFyYW0ge09iamVjdH0gW29wdGlvbnNdIEFsbCBvcHRpb25zIGFyZSBsaXN0ZWQgaW4gW01vbmdvREIgZG9jdW1lbnRhdGlvbl0oaHR0cHM6Ly9tb25nb2RiLmdpdGh1Yi5pby9ub2RlLW1vbmdvZGItbmF0aXZlLzQuMTEvaW50ZXJmYWNlcy9Db3VudERvY3VtZW50c09wdGlvbnMuaHRtbCkuIFBsZWFzZSBub3RlIHRoYXQgbm90IGFsbCBvZiB0aGVtIGFyZSBhdmFpbGFibGUgb24gdGhlIGNsaWVudC5cbiAgICogQHJldHVybnMge1Byb21pc2U8bnVtYmVyPn1cbiAgICovXG4gIGNvdW50RG9jdW1lbnRzKC4uLmFyZ3MpIHtcbiAgICByZXR1cm4gdGhpcy5fY29sbGVjdGlvbi5jb3VudERvY3VtZW50cyguLi5hcmdzKTtcbiAgfSxcblxuICAvKipcbiAgICogQHN1bW1hcnkgR2V0cyBhbiBlc3RpbWF0ZSBvZiB0aGUgY291bnQgb2YgZG9jdW1lbnRzIGluIGEgY29sbGVjdGlvbiB1c2luZyBjb2xsZWN0aW9uIG1ldGFkYXRhLiBGb3IgYW4gZXhhY3QgY291bnQgb2YgdGhlIGRvY3VtZW50cyBpbiBhIGNvbGxlY3Rpb24gc2VlIGBjb3VudERvY3VtZW50c2AuXG4gICAqIEBsb2N1cyBBbnl3aGVyZVxuICAgKiBAbWV0aG9kIGVzdGltYXRlZERvY3VtZW50Q291bnRcbiAgICogQG1lbWJlcm9mIE1vbmdvLkNvbGxlY3Rpb25cbiAgICogQGluc3RhbmNlXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBbb3B0aW9uc10gQWxsIG9wdGlvbnMgYXJlIGxpc3RlZCBpbiBbTW9uZ29EQiBkb2N1bWVudGF0aW9uXShodHRwczovL21vbmdvZGIuZ2l0aHViLmlvL25vZGUtbW9uZ29kYi1uYXRpdmUvNC4xMS9pbnRlcmZhY2VzL0VzdGltYXRlZERvY3VtZW50Q291bnRPcHRpb25zLmh0bWwpLiBQbGVhc2Ugbm90ZSB0aGF0IG5vdCBhbGwgb2YgdGhlbSBhcmUgYXZhaWxhYmxlIG9uIHRoZSBjbGllbnQuXG4gICAqIEByZXR1cm5zIHtQcm9taXNlPG51bWJlcj59XG4gICAqL1xuICBlc3RpbWF0ZWREb2N1bWVudENvdW50KC4uLmFyZ3MpIHtcbiAgICByZXR1cm4gdGhpcy5fY29sbGVjdGlvbi5lc3RpbWF0ZWREb2N1bWVudENvdW50KC4uLmFyZ3MpO1xuICB9LFxuXG4gIF9nZXRGaW5kU2VsZWN0b3IoYXJncykge1xuICAgIGlmIChhcmdzLmxlbmd0aCA9PSAwKSByZXR1cm4ge307XG4gICAgZWxzZSByZXR1cm4gYXJnc1swXTtcbiAgfSxcblxuICBfZ2V0RmluZE9wdGlvbnMoYXJncykge1xuICAgIGNvbnN0IFssIG9wdGlvbnNdID0gYXJncyB8fCBbXTtcbiAgICBjb25zdCBuZXdPcHRpb25zID0gbm9ybWFsaXplUHJvamVjdGlvbihvcHRpb25zKTtcblxuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICBpZiAoYXJncy5sZW5ndGggPCAyKSB7XG4gICAgICByZXR1cm4geyB0cmFuc2Zvcm06IHNlbGYuX3RyYW5zZm9ybSB9O1xuICAgIH0gZWxzZSB7XG4gICAgICBjaGVjayhcbiAgICAgICAgbmV3T3B0aW9ucyxcbiAgICAgICAgTWF0Y2guT3B0aW9uYWwoXG4gICAgICAgICAgTWF0Y2guT2JqZWN0SW5jbHVkaW5nKHtcbiAgICAgICAgICAgIHByb2plY3Rpb246IE1hdGNoLk9wdGlvbmFsKE1hdGNoLk9uZU9mKE9iamVjdCwgdW5kZWZpbmVkKSksXG4gICAgICAgICAgICBzb3J0OiBNYXRjaC5PcHRpb25hbChcbiAgICAgICAgICAgICAgTWF0Y2guT25lT2YoT2JqZWN0LCBBcnJheSwgRnVuY3Rpb24sIHVuZGVmaW5lZClcbiAgICAgICAgICAgICksXG4gICAgICAgICAgICBsaW1pdDogTWF0Y2guT3B0aW9uYWwoTWF0Y2guT25lT2YoTnVtYmVyLCB1bmRlZmluZWQpKSxcbiAgICAgICAgICAgIHNraXA6IE1hdGNoLk9wdGlvbmFsKE1hdGNoLk9uZU9mKE51bWJlciwgdW5kZWZpbmVkKSksXG4gICAgICAgICAgfSlcbiAgICAgICAgKVxuICAgICAgKTtcblxuXG4gICAgICByZXR1cm4ge1xuICAgICAgICB0cmFuc2Zvcm06IHNlbGYuX3RyYW5zZm9ybSxcbiAgICAgICAgLi4ubmV3T3B0aW9ucyxcbiAgICAgIH07XG4gICAgfVxuICB9LFxuXG4gIC8qKlxuICAgKiBAc3VtbWFyeSBGaW5kIHRoZSBkb2N1bWVudHMgaW4gYSBjb2xsZWN0aW9uIHRoYXQgbWF0Y2ggdGhlIHNlbGVjdG9yLlxuICAgKiBAbG9jdXMgQW55d2hlcmVcbiAgICogQG1ldGhvZCBmaW5kXG4gICAqIEBtZW1iZXJvZiBNb25nby5Db2xsZWN0aW9uXG4gICAqIEBpbnN0YW5jZVxuICAgKiBAcGFyYW0ge01vbmdvU2VsZWN0b3J9IFtzZWxlY3Rvcl0gQSBxdWVyeSBkZXNjcmliaW5nIHRoZSBkb2N1bWVudHMgdG8gZmluZFxuICAgKiBAcGFyYW0ge09iamVjdH0gW29wdGlvbnNdXG4gICAqIEBwYXJhbSB7TW9uZ29Tb3J0U3BlY2lmaWVyfSBvcHRpb25zLnNvcnQgU29ydCBvcmRlciAoZGVmYXVsdDogbmF0dXJhbCBvcmRlcilcbiAgICogQHBhcmFtIHtOdW1iZXJ9IG9wdGlvbnMuc2tpcCBOdW1iZXIgb2YgcmVzdWx0cyB0byBza2lwIGF0IHRoZSBiZWdpbm5pbmdcbiAgICogQHBhcmFtIHtOdW1iZXJ9IG9wdGlvbnMubGltaXQgTWF4aW11bSBudW1iZXIgb2YgcmVzdWx0cyB0byByZXR1cm5cbiAgICogQHBhcmFtIHtNb25nb0ZpZWxkU3BlY2lmaWVyfSBvcHRpb25zLmZpZWxkcyBEaWN0aW9uYXJ5IG9mIGZpZWxkcyB0byByZXR1cm4gb3IgZXhjbHVkZS5cbiAgICogQHBhcmFtIHtCb29sZWFufSBvcHRpb25zLnJlYWN0aXZlIChDbGllbnQgb25seSkgRGVmYXVsdCBgdHJ1ZWA7IHBhc3MgYGZhbHNlYCB0byBkaXNhYmxlIHJlYWN0aXZpdHlcbiAgICogQHBhcmFtIHtGdW5jdGlvbn0gb3B0aW9ucy50cmFuc2Zvcm0gT3ZlcnJpZGVzIGB0cmFuc2Zvcm1gIG9uIHRoZSAgW2BDb2xsZWN0aW9uYF0oI2NvbGxlY3Rpb25zKSBmb3IgdGhpcyBjdXJzb3IuICBQYXNzIGBudWxsYCB0byBkaXNhYmxlIHRyYW5zZm9ybWF0aW9uLlxuICAgKiBAcGFyYW0ge0Jvb2xlYW59IG9wdGlvbnMuZGlzYWJsZU9wbG9nIChTZXJ2ZXIgb25seSkgUGFzcyB0cnVlIHRvIGRpc2FibGUgb3Bsb2ctdGFpbGluZyBvbiB0aGlzIHF1ZXJ5LiBUaGlzIGFmZmVjdHMgdGhlIHdheSBzZXJ2ZXIgcHJvY2Vzc2VzIGNhbGxzIHRvIGBvYnNlcnZlYCBvbiB0aGlzIHF1ZXJ5LiBEaXNhYmxpbmcgdGhlIG9wbG9nIGNhbiBiZSB1c2VmdWwgd2hlbiB3b3JraW5nIHdpdGggZGF0YSB0aGF0IHVwZGF0ZXMgaW4gbGFyZ2UgYmF0Y2hlcy5cbiAgICogQHBhcmFtIHtOdW1iZXJ9IG9wdGlvbnMucG9sbGluZ0ludGVydmFsTXMgKFNlcnZlciBvbmx5KSBXaGVuIG9wbG9nIGlzIGRpc2FibGVkICh0aHJvdWdoIHRoZSB1c2Ugb2YgYGRpc2FibGVPcGxvZ2Agb3Igd2hlbiBvdGhlcndpc2Ugbm90IGF2YWlsYWJsZSksIHRoZSBmcmVxdWVuY3kgKGluIG1pbGxpc2Vjb25kcykgb2YgaG93IG9mdGVuIHRvIHBvbGwgdGhpcyBxdWVyeSB3aGVuIG9ic2VydmluZyBvbiB0aGUgc2VydmVyLiBEZWZhdWx0cyB0byAxMDAwMG1zICgxMCBzZWNvbmRzKS5cbiAgICogQHBhcmFtIHtOdW1iZXJ9IG9wdGlvbnMucG9sbGluZ1Rocm90dGxlTXMgKFNlcnZlciBvbmx5KSBXaGVuIG9wbG9nIGlzIGRpc2FibGVkICh0aHJvdWdoIHRoZSB1c2Ugb2YgYGRpc2FibGVPcGxvZ2Agb3Igd2hlbiBvdGhlcndpc2Ugbm90IGF2YWlsYWJsZSksIHRoZSBtaW5pbXVtIHRpbWUgKGluIG1pbGxpc2Vjb25kcykgdG8gYWxsb3cgYmV0d2VlbiByZS1wb2xsaW5nIHdoZW4gb2JzZXJ2aW5nIG9uIHRoZSBzZXJ2ZXIuIEluY3JlYXNpbmcgdGhpcyB3aWxsIHNhdmUgQ1BVIGFuZCBtb25nbyBsb2FkIGF0IHRoZSBleHBlbnNlIG9mIHNsb3dlciB1cGRhdGVzIHRvIHVzZXJzLiBEZWNyZWFzaW5nIHRoaXMgaXMgbm90IHJlY29tbWVuZGVkLiBEZWZhdWx0cyB0byA1MG1zLlxuICAgKiBAcGFyYW0ge051bWJlcn0gb3B0aW9ucy5tYXhUaW1lTXMgKFNlcnZlciBvbmx5KSBJZiBzZXQsIGluc3RydWN0cyBNb25nb0RCIHRvIHNldCBhIHRpbWUgbGltaXQgZm9yIHRoaXMgY3Vyc29yJ3Mgb3BlcmF0aW9ucy4gSWYgdGhlIG9wZXJhdGlvbiByZWFjaGVzIHRoZSBzcGVjaWZpZWQgdGltZSBsaW1pdCAoaW4gbWlsbGlzZWNvbmRzKSB3aXRob3V0IHRoZSBoYXZpbmcgYmVlbiBjb21wbGV0ZWQsIGFuIGV4Y2VwdGlvbiB3aWxsIGJlIHRocm93bi4gVXNlZnVsIHRvIHByZXZlbnQgYW4gKGFjY2lkZW50YWwgb3IgbWFsaWNpb3VzKSB1bm9wdGltaXplZCBxdWVyeSBmcm9tIGNhdXNpbmcgYSBmdWxsIGNvbGxlY3Rpb24gc2NhbiB0aGF0IHdvdWxkIGRpc3J1cHQgb3RoZXIgZGF0YWJhc2UgdXNlcnMsIGF0IHRoZSBleHBlbnNlIG9mIG5lZWRpbmcgdG8gaGFuZGxlIHRoZSByZXN1bHRpbmcgZXJyb3IuXG4gICAqIEBwYXJhbSB7U3RyaW5nfE9iamVjdH0gb3B0aW9ucy5oaW50IChTZXJ2ZXIgb25seSkgT3ZlcnJpZGVzIE1vbmdvREIncyBkZWZhdWx0IGluZGV4IHNlbGVjdGlvbiBhbmQgcXVlcnkgb3B0aW1pemF0aW9uIHByb2Nlc3MuIFNwZWNpZnkgYW4gaW5kZXggdG8gZm9yY2UgaXRzIHVzZSwgZWl0aGVyIGJ5IGl0cyBuYW1lIG9yIGluZGV4IHNwZWNpZmljYXRpb24uIFlvdSBjYW4gYWxzbyBzcGVjaWZ5IGB7ICRuYXR1cmFsIDogMSB9YCB0byBmb3JjZSBhIGZvcndhcmRzIGNvbGxlY3Rpb24gc2Nhbiwgb3IgYHsgJG5hdHVyYWwgOiAtMSB9YCBmb3IgYSByZXZlcnNlIGNvbGxlY3Rpb24gc2Nhbi4gU2V0dGluZyB0aGlzIGlzIG9ubHkgcmVjb21tZW5kZWQgZm9yIGFkdmFuY2VkIHVzZXJzLlxuICAgKiBAcGFyYW0ge1N0cmluZ30gb3B0aW9ucy5yZWFkUHJlZmVyZW5jZSAoU2VydmVyIG9ubHkpIFNwZWNpZmllcyBhIGN1c3RvbSBNb25nb0RCIFtgcmVhZFByZWZlcmVuY2VgXShodHRwczovL2RvY3MubW9uZ29kYi5jb20vbWFudWFsL2NvcmUvcmVhZC1wcmVmZXJlbmNlKSBmb3IgdGhpcyBwYXJ0aWN1bGFyIGN1cnNvci4gUG9zc2libGUgdmFsdWVzIGFyZSBgcHJpbWFyeWAsIGBwcmltYXJ5UHJlZmVycmVkYCwgYHNlY29uZGFyeWAsIGBzZWNvbmRhcnlQcmVmZXJyZWRgIGFuZCBgbmVhcmVzdGAuXG4gICAqIEByZXR1cm5zIHtNb25nby5DdXJzb3J9XG4gICAqL1xuICBmaW5kKC4uLmFyZ3MpIHtcbiAgICAvLyBDb2xsZWN0aW9uLmZpbmQoKSAocmV0dXJuIGFsbCBkb2NzKSBiZWhhdmVzIGRpZmZlcmVudGx5XG4gICAgLy8gZnJvbSBDb2xsZWN0aW9uLmZpbmQodW5kZWZpbmVkKSAocmV0dXJuIDAgZG9jcykuICBzbyBiZVxuICAgIC8vIGNhcmVmdWwgYWJvdXQgdGhlIGxlbmd0aCBvZiBhcmd1bWVudHMuXG4gICAgcmV0dXJuIHRoaXMuX2NvbGxlY3Rpb24uZmluZChcbiAgICAgIHRoaXMuX2dldEZpbmRTZWxlY3RvcihhcmdzKSxcbiAgICAgIHRoaXMuX2dldEZpbmRPcHRpb25zKGFyZ3MpXG4gICAgKTtcbiAgfSxcblxuICAvKipcbiAgICogQHN1bW1hcnkgRmluZHMgdGhlIGZpcnN0IGRvY3VtZW50IHRoYXQgbWF0Y2hlcyB0aGUgc2VsZWN0b3IsIGFzIG9yZGVyZWQgYnkgc29ydCBhbmQgc2tpcCBvcHRpb25zLiBSZXR1cm5zIGB1bmRlZmluZWRgIGlmIG5vIG1hdGNoaW5nIGRvY3VtZW50IGlzIGZvdW5kLlxuICAgKiBAbG9jdXMgQW55d2hlcmVcbiAgICogQG1ldGhvZCBmaW5kT25lXG4gICAqIEBtZW1iZXJvZiBNb25nby5Db2xsZWN0aW9uXG4gICAqIEBpbnN0YW5jZVxuICAgKiBAcGFyYW0ge01vbmdvU2VsZWN0b3J9IFtzZWxlY3Rvcl0gQSBxdWVyeSBkZXNjcmliaW5nIHRoZSBkb2N1bWVudHMgdG8gZmluZFxuICAgKiBAcGFyYW0ge09iamVjdH0gW29wdGlvbnNdXG4gICAqIEBwYXJhbSB7TW9uZ29Tb3J0U3BlY2lmaWVyfSBvcHRpb25zLnNvcnQgU29ydCBvcmRlciAoZGVmYXVsdDogbmF0dXJhbCBvcmRlcilcbiAgICogQHBhcmFtIHtOdW1iZXJ9IG9wdGlvbnMuc2tpcCBOdW1iZXIgb2YgcmVzdWx0cyB0byBza2lwIGF0IHRoZSBiZWdpbm5pbmdcbiAgICogQHBhcmFtIHtNb25nb0ZpZWxkU3BlY2lmaWVyfSBvcHRpb25zLmZpZWxkcyBEaWN0aW9uYXJ5IG9mIGZpZWxkcyB0byByZXR1cm4gb3IgZXhjbHVkZS5cbiAgICogQHBhcmFtIHtCb29sZWFufSBvcHRpb25zLnJlYWN0aXZlIChDbGllbnQgb25seSkgRGVmYXVsdCB0cnVlOyBwYXNzIGZhbHNlIHRvIGRpc2FibGUgcmVhY3Rpdml0eVxuICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBvcHRpb25zLnRyYW5zZm9ybSBPdmVycmlkZXMgYHRyYW5zZm9ybWAgb24gdGhlIFtgQ29sbGVjdGlvbmBdKCNjb2xsZWN0aW9ucykgZm9yIHRoaXMgY3Vyc29yLiAgUGFzcyBgbnVsbGAgdG8gZGlzYWJsZSB0cmFuc2Zvcm1hdGlvbi5cbiAgICogQHBhcmFtIHtTdHJpbmd9IG9wdGlvbnMucmVhZFByZWZlcmVuY2UgKFNlcnZlciBvbmx5KSBTcGVjaWZpZXMgYSBjdXN0b20gTW9uZ29EQiBbYHJlYWRQcmVmZXJlbmNlYF0oaHR0cHM6Ly9kb2NzLm1vbmdvZGIuY29tL21hbnVhbC9jb3JlL3JlYWQtcHJlZmVyZW5jZSkgZm9yIGZldGNoaW5nIHRoZSBkb2N1bWVudC4gUG9zc2libGUgdmFsdWVzIGFyZSBgcHJpbWFyeWAsIGBwcmltYXJ5UHJlZmVycmVkYCwgYHNlY29uZGFyeWAsIGBzZWNvbmRhcnlQcmVmZXJyZWRgIGFuZCBgbmVhcmVzdGAuXG4gICAqIEByZXR1cm5zIHtPYmplY3R9XG4gICAqL1xuICBmaW5kT25lKC4uLmFyZ3MpIHtcbiAgICAvLyBbRklCRVJTXVxuICAgIC8vIFRPRE86IFJlbW92ZSB0aGlzIHdoZW4gMy4wIGlzIHJlbGVhc2VkLlxuICAgIHdhcm5Vc2luZ09sZEFwaShcbiAgICAgIFwiZmluZE9uZVwiLFxuICAgICAgdGhpcy5fbmFtZSxcbiAgICAgIHRoaXMuZmluZE9uZS5pc0NhbGxlZEZyb21Bc3luY1xuICAgICk7XG4gICAgdGhpcy5maW5kT25lLmlzQ2FsbGVkRnJvbUFzeW5jID0gZmFsc2U7XG5cbiAgICByZXR1cm4gdGhpcy5fY29sbGVjdGlvbi5maW5kT25lKFxuICAgICAgdGhpcy5fZ2V0RmluZFNlbGVjdG9yKGFyZ3MpLFxuICAgICAgdGhpcy5fZ2V0RmluZE9wdGlvbnMoYXJncylcbiAgICApO1xuICB9LFxufSk7XG5cbk9iamVjdC5hc3NpZ24oTW9uZ28uQ29sbGVjdGlvbiwge1xuICBfcHVibGlzaEN1cnNvcihjdXJzb3IsIHN1YiwgY29sbGVjdGlvbikge1xuICAgIHZhciBvYnNlcnZlSGFuZGxlID0gY3Vyc29yLm9ic2VydmVDaGFuZ2VzKFxuICAgICAge1xuICAgICAgICBhZGRlZDogZnVuY3Rpb24oaWQsIGZpZWxkcykge1xuICAgICAgICAgIHN1Yi5hZGRlZChjb2xsZWN0aW9uLCBpZCwgZmllbGRzKTtcbiAgICAgICAgfSxcbiAgICAgICAgY2hhbmdlZDogZnVuY3Rpb24oaWQsIGZpZWxkcykge1xuICAgICAgICAgIHN1Yi5jaGFuZ2VkKGNvbGxlY3Rpb24sIGlkLCBmaWVsZHMpO1xuICAgICAgICB9LFxuICAgICAgICByZW1vdmVkOiBmdW5jdGlvbihpZCkge1xuICAgICAgICAgIHN1Yi5yZW1vdmVkKGNvbGxlY3Rpb24sIGlkKTtcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgICAvLyBQdWJsaWNhdGlvbnMgZG9uJ3QgbXV0YXRlIHRoZSBkb2N1bWVudHNcbiAgICAgIC8vIFRoaXMgaXMgdGVzdGVkIGJ5IHRoZSBgbGl2ZWRhdGEgLSBwdWJsaXNoIGNhbGxiYWNrcyBjbG9uZWAgdGVzdFxuICAgICAgeyBub25NdXRhdGluZ0NhbGxiYWNrczogdHJ1ZSB9XG4gICAgKTtcblxuICAgIC8vIFdlIGRvbid0IGNhbGwgc3ViLnJlYWR5KCkgaGVyZTogaXQgZ2V0cyBjYWxsZWQgaW4gbGl2ZWRhdGFfc2VydmVyLCBhZnRlclxuICAgIC8vIHBvc3NpYmx5IGNhbGxpbmcgX3B1Ymxpc2hDdXJzb3Igb24gbXVsdGlwbGUgcmV0dXJuZWQgY3Vyc29ycy5cblxuICAgIC8vIHJlZ2lzdGVyIHN0b3AgY2FsbGJhY2sgKGV4cGVjdHMgbGFtYmRhIHcvIG5vIGFyZ3MpLlxuICAgIHN1Yi5vblN0b3AoZnVuY3Rpb24oKSB7XG4gICAgICBvYnNlcnZlSGFuZGxlLnN0b3AoKTtcbiAgICB9KTtcblxuICAgIC8vIHJldHVybiB0aGUgb2JzZXJ2ZUhhbmRsZSBpbiBjYXNlIGl0IG5lZWRzIHRvIGJlIHN0b3BwZWQgZWFybHlcbiAgICByZXR1cm4gb2JzZXJ2ZUhhbmRsZTtcbiAgfSxcblxuICAvLyBwcm90ZWN0IGFnYWluc3QgZGFuZ2Vyb3VzIHNlbGVjdG9ycy4gIGZhbHNleSBhbmQge19pZDogZmFsc2V5fSBhcmUgYm90aFxuICAvLyBsaWtlbHkgcHJvZ3JhbW1lciBlcnJvciwgYW5kIG5vdCB3aGF0IHlvdSB3YW50LCBwYXJ0aWN1bGFybHkgZm9yIGRlc3RydWN0aXZlXG4gIC8vIG9wZXJhdGlvbnMuIElmIGEgZmFsc2V5IF9pZCBpcyBzZW50IGluLCBhIG5ldyBzdHJpbmcgX2lkIHdpbGwgYmVcbiAgLy8gZ2VuZXJhdGVkIGFuZCByZXR1cm5lZDsgaWYgYSBmYWxsYmFja0lkIGlzIHByb3ZpZGVkLCBpdCB3aWxsIGJlIHJldHVybmVkXG4gIC8vIGluc3RlYWQuXG4gIF9yZXdyaXRlU2VsZWN0b3Ioc2VsZWN0b3IsIHsgZmFsbGJhY2tJZCB9ID0ge30pIHtcbiAgICAvLyBzaG9ydGhhbmQgLS0gc2NhbGFycyBtYXRjaCBfaWRcbiAgICBpZiAoTG9jYWxDb2xsZWN0aW9uLl9zZWxlY3RvcklzSWQoc2VsZWN0b3IpKSBzZWxlY3RvciA9IHsgX2lkOiBzZWxlY3RvciB9O1xuXG4gICAgaWYgKEFycmF5LmlzQXJyYXkoc2VsZWN0b3IpKSB7XG4gICAgICAvLyBUaGlzIGlzIGNvbnNpc3RlbnQgd2l0aCB0aGUgTW9uZ28gY29uc29sZSBpdHNlbGY7IGlmIHdlIGRvbid0IGRvIHRoaXNcbiAgICAgIC8vIGNoZWNrIHBhc3NpbmcgYW4gZW1wdHkgYXJyYXkgZW5kcyB1cCBzZWxlY3RpbmcgYWxsIGl0ZW1zXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJNb25nbyBzZWxlY3RvciBjYW4ndCBiZSBhbiBhcnJheS5cIik7XG4gICAgfVxuXG4gICAgaWYgKCFzZWxlY3RvciB8fCAoJ19pZCcgaW4gc2VsZWN0b3IgJiYgIXNlbGVjdG9yLl9pZCkpIHtcbiAgICAgIC8vIGNhbid0IG1hdGNoIGFueXRoaW5nXG4gICAgICByZXR1cm4geyBfaWQ6IGZhbGxiYWNrSWQgfHwgUmFuZG9tLmlkKCkgfTtcbiAgICB9XG5cbiAgICByZXR1cm4gc2VsZWN0b3I7XG4gIH0sXG59KTtcblxuT2JqZWN0LmFzc2lnbihNb25nby5Db2xsZWN0aW9uLnByb3RvdHlwZSwge1xuICAvLyAnaW5zZXJ0JyBpbW1lZGlhdGVseSByZXR1cm5zIHRoZSBpbnNlcnRlZCBkb2N1bWVudCdzIG5ldyBfaWQuXG4gIC8vIFRoZSBvdGhlcnMgcmV0dXJuIHZhbHVlcyBpbW1lZGlhdGVseSBpZiB5b3UgYXJlIGluIGEgc3R1YiwgYW4gaW4tbWVtb3J5XG4gIC8vIHVubWFuYWdlZCBjb2xsZWN0aW9uLCBvciBhIG1vbmdvLWJhY2tlZCBjb2xsZWN0aW9uIGFuZCB5b3UgZG9uJ3QgcGFzcyBhXG4gIC8vIGNhbGxiYWNrLiAndXBkYXRlJyBhbmQgJ3JlbW92ZScgcmV0dXJuIHRoZSBudW1iZXIgb2YgYWZmZWN0ZWRcbiAgLy8gZG9jdW1lbnRzLiAndXBzZXJ0JyByZXR1cm5zIGFuIG9iamVjdCB3aXRoIGtleXMgJ251bWJlckFmZmVjdGVkJyBhbmQsIGlmIGFuXG4gIC8vIGluc2VydCBoYXBwZW5lZCwgJ2luc2VydGVkSWQnLlxuICAvL1xuICAvLyBPdGhlcndpc2UsIHRoZSBzZW1hbnRpY3MgYXJlIGV4YWN0bHkgbGlrZSBvdGhlciBtZXRob2RzOiB0aGV5IHRha2VcbiAgLy8gYSBjYWxsYmFjayBhcyBhbiBvcHRpb25hbCBsYXN0IGFyZ3VtZW50OyBpZiBubyBjYWxsYmFjayBpc1xuICAvLyBwcm92aWRlZCwgdGhleSBibG9jayB1bnRpbCB0aGUgb3BlcmF0aW9uIGlzIGNvbXBsZXRlLCBhbmQgdGhyb3cgYW5cbiAgLy8gZXhjZXB0aW9uIGlmIGl0IGZhaWxzOyBpZiBhIGNhbGxiYWNrIGlzIHByb3ZpZGVkLCB0aGVuIHRoZXkgZG9uJ3RcbiAgLy8gbmVjZXNzYXJpbHkgYmxvY2ssIGFuZCB0aGV5IGNhbGwgdGhlIGNhbGxiYWNrIHdoZW4gdGhleSBmaW5pc2ggd2l0aCBlcnJvciBhbmRcbiAgLy8gcmVzdWx0IGFyZ3VtZW50cy4gIChUaGUgaW5zZXJ0IG1ldGhvZCBwcm92aWRlcyB0aGUgZG9jdW1lbnQgSUQgYXMgaXRzIHJlc3VsdDtcbiAgLy8gdXBkYXRlIGFuZCByZW1vdmUgcHJvdmlkZSB0aGUgbnVtYmVyIG9mIGFmZmVjdGVkIGRvY3MgYXMgdGhlIHJlc3VsdDsgdXBzZXJ0XG4gIC8vIHByb3ZpZGVzIGFuIG9iamVjdCB3aXRoIG51bWJlckFmZmVjdGVkIGFuZCBtYXliZSBpbnNlcnRlZElkLilcbiAgLy9cbiAgLy8gT24gdGhlIGNsaWVudCwgYmxvY2tpbmcgaXMgaW1wb3NzaWJsZSwgc28gaWYgYSBjYWxsYmFja1xuICAvLyBpc24ndCBwcm92aWRlZCwgdGhleSBqdXN0IHJldHVybiBpbW1lZGlhdGVseSBhbmQgYW55IGVycm9yXG4gIC8vIGluZm9ybWF0aW9uIGlzIGxvc3QuXG4gIC8vXG4gIC8vIFRoZXJlJ3Mgb25lIG1vcmUgdHdlYWsuIE9uIHRoZSBjbGllbnQsIGlmIHlvdSBkb24ndCBwcm92aWRlIGFcbiAgLy8gY2FsbGJhY2ssIHRoZW4gaWYgdGhlcmUgaXMgYW4gZXJyb3IsIGEgbWVzc2FnZSB3aWxsIGJlIGxvZ2dlZCB3aXRoXG4gIC8vIE1ldGVvci5fZGVidWcuXG4gIC8vXG4gIC8vIFRoZSBpbnRlbnQgKHRob3VnaCB0aGlzIGlzIGFjdHVhbGx5IGRldGVybWluZWQgYnkgdGhlIHVuZGVybHlpbmdcbiAgLy8gZHJpdmVycykgaXMgdGhhdCB0aGUgb3BlcmF0aW9ucyBzaG91bGQgYmUgZG9uZSBzeW5jaHJvbm91c2x5LCBub3RcbiAgLy8gZ2VuZXJhdGluZyB0aGVpciByZXN1bHQgdW50aWwgdGhlIGRhdGFiYXNlIGhhcyBhY2tub3dsZWRnZWRcbiAgLy8gdGhlbS4gSW4gdGhlIGZ1dHVyZSBtYXliZSB3ZSBzaG91bGQgcHJvdmlkZSBhIGZsYWcgdG8gdHVybiB0aGlzXG4gIC8vIG9mZi5cblxuICAvKipcbiAgICogQHN1bW1hcnkgSW5zZXJ0IGEgZG9jdW1lbnQgaW4gdGhlIGNvbGxlY3Rpb24uICBSZXR1cm5zIGl0cyB1bmlxdWUgX2lkLlxuICAgKiBAbG9jdXMgQW55d2hlcmVcbiAgICogQG1ldGhvZCAgaW5zZXJ0XG4gICAqIEBtZW1iZXJvZiBNb25nby5Db2xsZWN0aW9uXG4gICAqIEBpbnN0YW5jZVxuICAgKiBAcGFyYW0ge09iamVjdH0gZG9jIFRoZSBkb2N1bWVudCB0byBpbnNlcnQuIE1heSBub3QgeWV0IGhhdmUgYW4gX2lkIGF0dHJpYnV0ZSwgaW4gd2hpY2ggY2FzZSBNZXRlb3Igd2lsbCBnZW5lcmF0ZSBvbmUgZm9yIHlvdS5cbiAgICogQHBhcmFtIHtGdW5jdGlvbn0gW2NhbGxiYWNrXSBPcHRpb25hbC4gIElmIHByZXNlbnQsIGNhbGxlZCB3aXRoIGFuIGVycm9yIG9iamVjdCBhcyB0aGUgZmlyc3QgYXJndW1lbnQgYW5kLCBpZiBubyBlcnJvciwgdGhlIF9pZCBhcyB0aGUgc2Vjb25kLlxuICAgKi9cbiAgaW5zZXJ0KGRvYywgY2FsbGJhY2spIHtcbiAgICAvLyBNYWtlIHN1cmUgd2Ugd2VyZSBwYXNzZWQgYSBkb2N1bWVudCB0byBpbnNlcnRcbiAgICBpZiAoIWRvYykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdpbnNlcnQgcmVxdWlyZXMgYW4gYXJndW1lbnQnKTtcbiAgICB9XG5cbiAgICAvLyBbRklCRVJTXVxuICAgIC8vIFRPRE86IFJlbW92ZSB0aGlzIHdoZW4gMy4wIGlzIHJlbGVhc2VkLlxuICAgIHdhcm5Vc2luZ09sZEFwaShcbiAgICAgIFwiaW5zZXJ0XCIsXG4gICAgICB0aGlzLl9uYW1lLFxuICAgICAgdGhpcy5pbnNlcnQuaXNDYWxsZWRGcm9tQXN5bmNcbiAgICApO1xuICAgIHRoaXMuaW5zZXJ0LmlzQ2FsbGVkRnJvbUFzeW5jID0gZmFsc2U7XG5cbiAgICAvLyBNYWtlIGEgc2hhbGxvdyBjbG9uZSBvZiB0aGUgZG9jdW1lbnQsIHByZXNlcnZpbmcgaXRzIHByb3RvdHlwZS5cbiAgICBkb2MgPSBPYmplY3QuY3JlYXRlKFxuICAgICAgT2JqZWN0LmdldFByb3RvdHlwZU9mKGRvYyksXG4gICAgICBPYmplY3QuZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9ycyhkb2MpXG4gICAgKTtcblxuICAgIGlmICgnX2lkJyBpbiBkb2MpIHtcbiAgICAgIGlmIChcbiAgICAgICAgIWRvYy5faWQgfHxcbiAgICAgICAgISh0eXBlb2YgZG9jLl9pZCA9PT0gJ3N0cmluZycgfHwgZG9jLl9pZCBpbnN0YW5jZW9mIE1vbmdvLk9iamVjdElEKVxuICAgICAgKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgICAnTWV0ZW9yIHJlcXVpcmVzIGRvY3VtZW50IF9pZCBmaWVsZHMgdG8gYmUgbm9uLWVtcHR5IHN0cmluZ3Mgb3IgT2JqZWN0SURzJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBsZXQgZ2VuZXJhdGVJZCA9IHRydWU7XG5cbiAgICAgIC8vIERvbid0IGdlbmVyYXRlIHRoZSBpZCBpZiB3ZSdyZSB0aGUgY2xpZW50IGFuZCB0aGUgJ291dGVybW9zdCcgY2FsbFxuICAgICAgLy8gVGhpcyBvcHRpbWl6YXRpb24gc2F2ZXMgdXMgcGFzc2luZyBib3RoIHRoZSByYW5kb21TZWVkIGFuZCB0aGUgaWRcbiAgICAgIC8vIFBhc3NpbmcgYm90aCBpcyByZWR1bmRhbnQuXG4gICAgICBpZiAodGhpcy5faXNSZW1vdGVDb2xsZWN0aW9uKCkpIHtcbiAgICAgICAgY29uc3QgZW5jbG9zaW5nID0gRERQLl9DdXJyZW50TWV0aG9kSW52b2NhdGlvbi5nZXQoKTtcbiAgICAgICAgaWYgKCFlbmNsb3NpbmcpIHtcbiAgICAgICAgICBnZW5lcmF0ZUlkID0gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKGdlbmVyYXRlSWQpIHtcbiAgICAgICAgZG9jLl9pZCA9IHRoaXMuX21ha2VOZXdJRCgpO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIE9uIGluc2VydHMsIGFsd2F5cyByZXR1cm4gdGhlIGlkIHRoYXQgd2UgZ2VuZXJhdGVkOyBvbiBhbGwgb3RoZXJcbiAgICAvLyBvcGVyYXRpb25zLCBqdXN0IHJldHVybiB0aGUgcmVzdWx0IGZyb20gdGhlIGNvbGxlY3Rpb24uXG4gICAgdmFyIGNob29zZVJldHVyblZhbHVlRnJvbUNvbGxlY3Rpb25SZXN1bHQgPSBmdW5jdGlvbihyZXN1bHQpIHtcbiAgICAgIGlmIChkb2MuX2lkKSB7XG4gICAgICAgIHJldHVybiBkb2MuX2lkO1xuICAgICAgfVxuXG4gICAgICAvLyBYWFggd2hhdCBpcyB0aGlzIGZvcj8/XG4gICAgICAvLyBJdCdzIHNvbWUgaXRlcmFjdGlvbiBiZXR3ZWVuIHRoZSBjYWxsYmFjayB0byBfY2FsbE11dGF0b3JNZXRob2QgYW5kXG4gICAgICAvLyB0aGUgcmV0dXJuIHZhbHVlIGNvbnZlcnNpb25cbiAgICAgIGRvYy5faWQgPSByZXN1bHQ7XG5cbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfTtcblxuICAgIGNvbnN0IHdyYXBwZWRDYWxsYmFjayA9IHdyYXBDYWxsYmFjayhcbiAgICAgIGNhbGxiYWNrLFxuICAgICAgY2hvb3NlUmV0dXJuVmFsdWVGcm9tQ29sbGVjdGlvblJlc3VsdFxuICAgICk7XG5cbiAgICBpZiAodGhpcy5faXNSZW1vdGVDb2xsZWN0aW9uKCkpIHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IHRoaXMuX2NhbGxNdXRhdG9yTWV0aG9kKCdpbnNlcnQnLCBbZG9jXSwgd3JhcHBlZENhbGxiYWNrKTtcbiAgICAgIHJldHVybiBjaG9vc2VSZXR1cm5WYWx1ZUZyb21Db2xsZWN0aW9uUmVzdWx0KHJlc3VsdCk7XG4gICAgfVxuXG4gICAgLy8gaXQncyBteSBjb2xsZWN0aW9uLiAgZGVzY2VuZCBpbnRvIHRoZSBjb2xsZWN0aW9uIG9iamVjdFxuICAgIC8vIGFuZCBwcm9wYWdhdGUgYW55IGV4Y2VwdGlvbi5cbiAgICB0cnkge1xuICAgICAgLy8gSWYgdGhlIHVzZXIgcHJvdmlkZWQgYSBjYWxsYmFjayBhbmQgdGhlIGNvbGxlY3Rpb24gaW1wbGVtZW50cyB0aGlzXG4gICAgICAvLyBvcGVyYXRpb24gYXN5bmNocm9ub3VzbHksIHRoZW4gcXVlcnlSZXQgd2lsbCBiZSB1bmRlZmluZWQsIGFuZCB0aGVcbiAgICAgIC8vIHJlc3VsdCB3aWxsIGJlIHJldHVybmVkIHRocm91Z2ggdGhlIGNhbGxiYWNrIGluc3RlYWQuXG4gICAgICBjb25zdCByZXN1bHQgPSB0aGlzLl9jb2xsZWN0aW9uLmluc2VydChkb2MsIHdyYXBwZWRDYWxsYmFjayk7XG4gICAgICByZXR1cm4gY2hvb3NlUmV0dXJuVmFsdWVGcm9tQ29sbGVjdGlvblJlc3VsdChyZXN1bHQpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGlmIChjYWxsYmFjaykge1xuICAgICAgICBjYWxsYmFjayhlKTtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICB9XG4gICAgICB0aHJvdyBlO1xuICAgIH1cbiAgfSxcblxuICAvKipcbiAgICogQHN1bW1hcnkgTW9kaWZ5IG9uZSBvciBtb3JlIGRvY3VtZW50cyBpbiB0aGUgY29sbGVjdGlvbi4gUmV0dXJucyB0aGUgbnVtYmVyIG9mIG1hdGNoZWQgZG9jdW1lbnRzLlxuICAgKiBAbG9jdXMgQW55d2hlcmVcbiAgICogQG1ldGhvZCB1cGRhdGVcbiAgICogQG1lbWJlcm9mIE1vbmdvLkNvbGxlY3Rpb25cbiAgICogQGluc3RhbmNlXG4gICAqIEBwYXJhbSB7TW9uZ29TZWxlY3Rvcn0gc2VsZWN0b3IgU3BlY2lmaWVzIHdoaWNoIGRvY3VtZW50cyB0byBtb2RpZnlcbiAgICogQHBhcmFtIHtNb25nb01vZGlmaWVyfSBtb2RpZmllciBTcGVjaWZpZXMgaG93IHRvIG1vZGlmeSB0aGUgZG9jdW1lbnRzXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBbb3B0aW9uc11cbiAgICogQHBhcmFtIHtCb29sZWFufSBvcHRpb25zLm11bHRpIFRydWUgdG8gbW9kaWZ5IGFsbCBtYXRjaGluZyBkb2N1bWVudHM7IGZhbHNlIHRvIG9ubHkgbW9kaWZ5IG9uZSBvZiB0aGUgbWF0Y2hpbmcgZG9jdW1lbnRzICh0aGUgZGVmYXVsdCkuXG4gICAqIEBwYXJhbSB7Qm9vbGVhbn0gb3B0aW9ucy51cHNlcnQgVHJ1ZSB0byBpbnNlcnQgYSBkb2N1bWVudCBpZiBubyBtYXRjaGluZyBkb2N1bWVudHMgYXJlIGZvdW5kLlxuICAgKiBAcGFyYW0ge0FycmF5fSBvcHRpb25zLmFycmF5RmlsdGVycyBPcHRpb25hbC4gVXNlZCBpbiBjb21iaW5hdGlvbiB3aXRoIE1vbmdvREIgW2ZpbHRlcmVkIHBvc2l0aW9uYWwgb3BlcmF0b3JdKGh0dHBzOi8vZG9jcy5tb25nb2RiLmNvbS9tYW51YWwvcmVmZXJlbmNlL29wZXJhdG9yL3VwZGF0ZS9wb3NpdGlvbmFsLWZpbHRlcmVkLykgdG8gc3BlY2lmeSB3aGljaCBlbGVtZW50cyB0byBtb2RpZnkgaW4gYW4gYXJyYXkgZmllbGQuXG4gICAqIEBwYXJhbSB7RnVuY3Rpb259IFtjYWxsYmFja10gT3B0aW9uYWwuICBJZiBwcmVzZW50LCBjYWxsZWQgd2l0aCBhbiBlcnJvciBvYmplY3QgYXMgdGhlIGZpcnN0IGFyZ3VtZW50IGFuZCwgaWYgbm8gZXJyb3IsIHRoZSBudW1iZXIgb2YgYWZmZWN0ZWQgZG9jdW1lbnRzIGFzIHRoZSBzZWNvbmQuXG4gICAqL1xuICB1cGRhdGUoc2VsZWN0b3IsIG1vZGlmaWVyLCAuLi5vcHRpb25zQW5kQ2FsbGJhY2spIHtcbiAgICBjb25zdCBjYWxsYmFjayA9IHBvcENhbGxiYWNrRnJvbUFyZ3Mob3B0aW9uc0FuZENhbGxiYWNrKTtcblxuICAgIC8vIFdlJ3ZlIGFscmVhZHkgcG9wcGVkIG9mZiB0aGUgY2FsbGJhY2ssIHNvIHdlIGFyZSBsZWZ0IHdpdGggYW4gYXJyYXlcbiAgICAvLyBvZiBvbmUgb3IgemVybyBpdGVtc1xuICAgIGNvbnN0IG9wdGlvbnMgPSB7IC4uLihvcHRpb25zQW5kQ2FsbGJhY2tbMF0gfHwgbnVsbCkgfTtcbiAgICBsZXQgaW5zZXJ0ZWRJZDtcbiAgICBpZiAob3B0aW9ucyAmJiBvcHRpb25zLnVwc2VydCkge1xuICAgICAgLy8gc2V0IGBpbnNlcnRlZElkYCBpZiBhYnNlbnQuICBgaW5zZXJ0ZWRJZGAgaXMgYSBNZXRlb3IgZXh0ZW5zaW9uLlxuICAgICAgaWYgKG9wdGlvbnMuaW5zZXJ0ZWRJZCkge1xuICAgICAgICBpZiAoXG4gICAgICAgICAgIShcbiAgICAgICAgICAgIHR5cGVvZiBvcHRpb25zLmluc2VydGVkSWQgPT09ICdzdHJpbmcnIHx8XG4gICAgICAgICAgICBvcHRpb25zLmluc2VydGVkSWQgaW5zdGFuY2VvZiBNb25nby5PYmplY3RJRFxuICAgICAgICAgIClcbiAgICAgICAgKVxuICAgICAgICAgIHRocm93IG5ldyBFcnJvcignaW5zZXJ0ZWRJZCBtdXN0IGJlIHN0cmluZyBvciBPYmplY3RJRCcpO1xuICAgICAgICBpbnNlcnRlZElkID0gb3B0aW9ucy5pbnNlcnRlZElkO1xuICAgICAgfSBlbHNlIGlmICghc2VsZWN0b3IgfHwgIXNlbGVjdG9yLl9pZCkge1xuICAgICAgICBpbnNlcnRlZElkID0gdGhpcy5fbWFrZU5ld0lEKCk7XG4gICAgICAgIG9wdGlvbnMuZ2VuZXJhdGVkSWQgPSB0cnVlO1xuICAgICAgICBvcHRpb25zLmluc2VydGVkSWQgPSBpbnNlcnRlZElkO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIFtGSUJFUlNdXG4gICAgLy8gVE9ETzogUmVtb3ZlIHRoaXMgd2hlbiAzLjAgaXMgcmVsZWFzZWQuXG4gICAgd2FyblVzaW5nT2xkQXBpKFxuICAgICAgXCJ1cGRhdGVcIixcbiAgICAgIHRoaXMuX25hbWUsXG4gICAgICB0aGlzLnVwZGF0ZS5pc0NhbGxlZEZyb21Bc3luY1xuICAgICk7XG4gICAgdGhpcy51cGRhdGUuaXNDYWxsZWRGcm9tQXN5bmMgPSBmYWxzZTtcblxuICAgIHNlbGVjdG9yID0gTW9uZ28uQ29sbGVjdGlvbi5fcmV3cml0ZVNlbGVjdG9yKHNlbGVjdG9yLCB7XG4gICAgICBmYWxsYmFja0lkOiBpbnNlcnRlZElkLFxuICAgIH0pO1xuXG4gICAgY29uc3Qgd3JhcHBlZENhbGxiYWNrID0gd3JhcENhbGxiYWNrKGNhbGxiYWNrKTtcblxuICAgIGlmICh0aGlzLl9pc1JlbW90ZUNvbGxlY3Rpb24oKSkge1xuICAgICAgY29uc3QgYXJncyA9IFtzZWxlY3RvciwgbW9kaWZpZXIsIG9wdGlvbnNdO1xuXG4gICAgICByZXR1cm4gdGhpcy5fY2FsbE11dGF0b3JNZXRob2QoJ3VwZGF0ZScsIGFyZ3MsIHdyYXBwZWRDYWxsYmFjayk7XG4gICAgfVxuXG4gICAgLy8gaXQncyBteSBjb2xsZWN0aW9uLiAgZGVzY2VuZCBpbnRvIHRoZSBjb2xsZWN0aW9uIG9iamVjdFxuICAgIC8vIGFuZCBwcm9wYWdhdGUgYW55IGV4Y2VwdGlvbi5cbiAgICB0cnkge1xuICAgICAgLy8gSWYgdGhlIHVzZXIgcHJvdmlkZWQgYSBjYWxsYmFjayBhbmQgdGhlIGNvbGxlY3Rpb24gaW1wbGVtZW50cyB0aGlzXG4gICAgICAvLyBvcGVyYXRpb24gYXN5bmNocm9ub3VzbHksIHRoZW4gcXVlcnlSZXQgd2lsbCBiZSB1bmRlZmluZWQsIGFuZCB0aGVcbiAgICAgIC8vIHJlc3VsdCB3aWxsIGJlIHJldHVybmVkIHRocm91Z2ggdGhlIGNhbGxiYWNrIGluc3RlYWQuXG4gICAgICByZXR1cm4gdGhpcy5fY29sbGVjdGlvbi51cGRhdGUoXG4gICAgICAgIHNlbGVjdG9yLFxuICAgICAgICBtb2RpZmllcixcbiAgICAgICAgb3B0aW9ucyxcbiAgICAgICAgd3JhcHBlZENhbGxiYWNrXG4gICAgICApO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGlmIChjYWxsYmFjaykge1xuICAgICAgICBjYWxsYmFjayhlKTtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICB9XG4gICAgICB0aHJvdyBlO1xuICAgIH1cbiAgfSxcblxuICAvKipcbiAgICogQHN1bW1hcnkgUmVtb3ZlIGRvY3VtZW50cyBmcm9tIHRoZSBjb2xsZWN0aW9uXG4gICAqIEBsb2N1cyBBbnl3aGVyZVxuICAgKiBAbWV0aG9kIHJlbW92ZVxuICAgKiBAbWVtYmVyb2YgTW9uZ28uQ29sbGVjdGlvblxuICAgKiBAaW5zdGFuY2VcbiAgICogQHBhcmFtIHtNb25nb1NlbGVjdG9yfSBzZWxlY3RvciBTcGVjaWZpZXMgd2hpY2ggZG9jdW1lbnRzIHRvIHJlbW92ZVxuICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBbY2FsbGJhY2tdIE9wdGlvbmFsLiAgSWYgcHJlc2VudCwgY2FsbGVkIHdpdGggYW4gZXJyb3Igb2JqZWN0IGFzIGl0cyBhcmd1bWVudC5cbiAgICovXG4gIHJlbW92ZShzZWxlY3RvciwgY2FsbGJhY2spIHtcbiAgICBzZWxlY3RvciA9IE1vbmdvLkNvbGxlY3Rpb24uX3Jld3JpdGVTZWxlY3RvcihzZWxlY3Rvcik7XG5cbiAgICBjb25zdCB3cmFwcGVkQ2FsbGJhY2sgPSB3cmFwQ2FsbGJhY2soY2FsbGJhY2spO1xuXG4gICAgaWYgKHRoaXMuX2lzUmVtb3RlQ29sbGVjdGlvbigpKSB7XG4gICAgICByZXR1cm4gdGhpcy5fY2FsbE11dGF0b3JNZXRob2QoJ3JlbW92ZScsIFtzZWxlY3Rvcl0sIHdyYXBwZWRDYWxsYmFjayk7XG4gICAgfVxuXG4gICAgLy8gW0ZJQkVSU11cbiAgICAvLyBUT0RPOiBSZW1vdmUgdGhpcyB3aGVuIDMuMCBpcyByZWxlYXNlZC5cbiAgICB3YXJuVXNpbmdPbGRBcGkoXG4gICAgICBcInJlbW92ZVwiLFxuICAgICAgdGhpcy5fbmFtZSxcbiAgICAgIHRoaXMucmVtb3ZlLmlzQ2FsbGVkRnJvbUFzeW5jXG4gICAgKTtcbiAgICB0aGlzLnJlbW92ZS5pc0NhbGxlZEZyb21Bc3luYyA9IGZhbHNlO1xuICAgIC8vIGl0J3MgbXkgY29sbGVjdGlvbi4gIGRlc2NlbmQgaW50byB0aGUgY29sbGVjdGlvbiBvYmplY3RcbiAgICAvLyBhbmQgcHJvcGFnYXRlIGFueSBleGNlcHRpb24uXG4gICAgdHJ5IHtcbiAgICAgIC8vIElmIHRoZSB1c2VyIHByb3ZpZGVkIGEgY2FsbGJhY2sgYW5kIHRoZSBjb2xsZWN0aW9uIGltcGxlbWVudHMgdGhpc1xuICAgICAgLy8gb3BlcmF0aW9uIGFzeW5jaHJvbm91c2x5LCB0aGVuIHF1ZXJ5UmV0IHdpbGwgYmUgdW5kZWZpbmVkLCBhbmQgdGhlXG4gICAgICAvLyByZXN1bHQgd2lsbCBiZSByZXR1cm5lZCB0aHJvdWdoIHRoZSBjYWxsYmFjayBpbnN0ZWFkLlxuICAgICAgcmV0dXJuIHRoaXMuX2NvbGxlY3Rpb24ucmVtb3ZlKHNlbGVjdG9yLCB3cmFwcGVkQ2FsbGJhY2spO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGlmIChjYWxsYmFjaykge1xuICAgICAgICBjYWxsYmFjayhlKTtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICB9XG4gICAgICB0aHJvdyBlO1xuICAgIH1cbiAgfSxcblxuICAvLyBEZXRlcm1pbmUgaWYgdGhpcyBjb2xsZWN0aW9uIGlzIHNpbXBseSBhIG1pbmltb25nbyByZXByZXNlbnRhdGlvbiBvZiBhIHJlYWxcbiAgLy8gZGF0YWJhc2Ugb24gYW5vdGhlciBzZXJ2ZXJcbiAgX2lzUmVtb3RlQ29sbGVjdGlvbigpIHtcbiAgICAvLyBYWFggc2VlICNNZXRlb3JTZXJ2ZXJOdWxsXG4gICAgcmV0dXJuIHRoaXMuX2Nvbm5lY3Rpb24gJiYgdGhpcy5fY29ubmVjdGlvbiAhPT0gTWV0ZW9yLnNlcnZlcjtcbiAgfSxcblxuICAvKipcbiAgICogQHN1bW1hcnkgTW9kaWZ5IG9uZSBvciBtb3JlIGRvY3VtZW50cyBpbiB0aGUgY29sbGVjdGlvbiwgb3IgaW5zZXJ0IG9uZSBpZiBubyBtYXRjaGluZyBkb2N1bWVudHMgd2VyZSBmb3VuZC4gUmV0dXJucyBhbiBvYmplY3Qgd2l0aCBrZXlzIGBudW1iZXJBZmZlY3RlZGAgKHRoZSBudW1iZXIgb2YgZG9jdW1lbnRzIG1vZGlmaWVkKSAgYW5kIGBpbnNlcnRlZElkYCAodGhlIHVuaXF1ZSBfaWQgb2YgdGhlIGRvY3VtZW50IHRoYXQgd2FzIGluc2VydGVkLCBpZiBhbnkpLlxuICAgKiBAbG9jdXMgQW55d2hlcmVcbiAgICogQG1ldGhvZCB1cHNlcnRcbiAgICogQG1lbWJlcm9mIE1vbmdvLkNvbGxlY3Rpb25cbiAgICogQGluc3RhbmNlXG4gICAqIEBwYXJhbSB7TW9uZ29TZWxlY3Rvcn0gc2VsZWN0b3IgU3BlY2lmaWVzIHdoaWNoIGRvY3VtZW50cyB0byBtb2RpZnlcbiAgICogQHBhcmFtIHtNb25nb01vZGlmaWVyfSBtb2RpZmllciBTcGVjaWZpZXMgaG93IHRvIG1vZGlmeSB0aGUgZG9jdW1lbnRzXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBbb3B0aW9uc11cbiAgICogQHBhcmFtIHtCb29sZWFufSBvcHRpb25zLm11bHRpIFRydWUgdG8gbW9kaWZ5IGFsbCBtYXRjaGluZyBkb2N1bWVudHM7IGZhbHNlIHRvIG9ubHkgbW9kaWZ5IG9uZSBvZiB0aGUgbWF0Y2hpbmcgZG9jdW1lbnRzICh0aGUgZGVmYXVsdCkuXG4gICAqIEBwYXJhbSB7RnVuY3Rpb259IFtjYWxsYmFja10gT3B0aW9uYWwuICBJZiBwcmVzZW50LCBjYWxsZWQgd2l0aCBhbiBlcnJvciBvYmplY3QgYXMgdGhlIGZpcnN0IGFyZ3VtZW50IGFuZCwgaWYgbm8gZXJyb3IsIHRoZSBudW1iZXIgb2YgYWZmZWN0ZWQgZG9jdW1lbnRzIGFzIHRoZSBzZWNvbmQuXG4gICAqL1xuICB1cHNlcnQoc2VsZWN0b3IsIG1vZGlmaWVyLCBvcHRpb25zLCBjYWxsYmFjaykge1xuICAgIGlmICghY2FsbGJhY2sgJiYgdHlwZW9mIG9wdGlvbnMgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIGNhbGxiYWNrID0gb3B0aW9ucztcbiAgICAgIG9wdGlvbnMgPSB7fTtcbiAgICB9XG5cbiAgICAvLyBbRklCRVJTXVxuICAgIC8vIFRPRE86IFJlbW92ZSB0aGlzIHdoZW4gMy4wIGlzIHJlbGVhc2VkLlxuICAgIHdhcm5Vc2luZ09sZEFwaShcbiAgICAgIFwidXBzZXJ0XCIsXG4gICAgICB0aGlzLl9uYW1lLFxuICAgICAgdGhpcy51cHNlcnQuaXNDYWxsZWRGcm9tQXN5bmNcbiAgICApO1xuICAgIHRoaXMudXBzZXJ0LmlzQ2FsbGVkRnJvbUFzeW5jID0gZmFsc2U7IFxuICAgIC8vIGNhdWdodCBoZXJlIGh0dHBzOi8vZ2l0aHViLmNvbS9tZXRlb3IvbWV0ZW9yL2lzc3Vlcy8xMjYyNiBcbiAgICB0aGlzLnVwZGF0ZS5pc0NhbGxlZEZyb21Bc3luYyA9IHRydWU7IC8vIHRvIG5vdCB0cmlnZ2VyIG9uIHRoZSBuZXh0IGNhbGxcbiAgICByZXR1cm4gdGhpcy51cGRhdGUoXG4gICAgICBzZWxlY3RvcixcbiAgICAgIG1vZGlmaWVyLFxuICAgICAge1xuICAgICAgICAuLi5vcHRpb25zLFxuICAgICAgICBfcmV0dXJuT2JqZWN0OiB0cnVlLFxuICAgICAgICB1cHNlcnQ6IHRydWUsXG4gICAgICB9LFxuICAgICAgY2FsbGJhY2tcbiAgICApO1xuICB9LFxuXG4gIC8vIFdlJ2xsIGFjdHVhbGx5IGRlc2lnbiBhbiBpbmRleCBBUEkgbGF0ZXIuIEZvciBub3csIHdlIGp1c3QgcGFzcyB0aHJvdWdoIHRvXG4gIC8vIE1vbmdvJ3MsIGJ1dCBtYWtlIGl0IHN5bmNocm9ub3VzLlxuICBfZW5zdXJlSW5kZXgoaW5kZXgsIG9wdGlvbnMpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgaWYgKCFzZWxmLl9jb2xsZWN0aW9uLl9lbnN1cmVJbmRleCB8fCAhc2VsZi5fY29sbGVjdGlvbi5jcmVhdGVJbmRleClcbiAgICAgIHRocm93IG5ldyBFcnJvcignQ2FuIG9ubHkgY2FsbCBjcmVhdGVJbmRleCBvbiBzZXJ2ZXIgY29sbGVjdGlvbnMnKTtcbiAgICBpZiAoc2VsZi5fY29sbGVjdGlvbi5jcmVhdGVJbmRleCkge1xuICAgICAgc2VsZi5fY29sbGVjdGlvbi5jcmVhdGVJbmRleChpbmRleCwgb3B0aW9ucyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGltcG9ydCB7IExvZyB9IGZyb20gJ21ldGVvci9sb2dnaW5nJztcbiAgICAgIExvZy5kZWJ1ZyhgX2Vuc3VyZUluZGV4IGhhcyBiZWVuIGRlcHJlY2F0ZWQsIHBsZWFzZSB1c2UgdGhlIG5ldyAnY3JlYXRlSW5kZXgnIGluc3RlYWQke29wdGlvbnM/Lm5hbWUgPyBgLCBpbmRleCBuYW1lOiAke29wdGlvbnMubmFtZX1gIDogYCwgaW5kZXg6ICR7SlNPTi5zdHJpbmdpZnkoaW5kZXgpfWB9YClcbiAgICAgIHNlbGYuX2NvbGxlY3Rpb24uX2Vuc3VyZUluZGV4KGluZGV4LCBvcHRpb25zKTtcbiAgICB9XG4gIH0sXG5cbiAgLyoqXG4gICAqIEBzdW1tYXJ5IENyZWF0ZXMgdGhlIHNwZWNpZmllZCBpbmRleCBvbiB0aGUgY29sbGVjdGlvbi5cbiAgICogQGxvY3VzIHNlcnZlclxuICAgKiBAbWV0aG9kIGNyZWF0ZUluZGV4XG4gICAqIEBtZW1iZXJvZiBNb25nby5Db2xsZWN0aW9uXG4gICAqIEBpbnN0YW5jZVxuICAgKiBAcGFyYW0ge09iamVjdH0gaW5kZXggQSBkb2N1bWVudCB0aGF0IGNvbnRhaW5zIHRoZSBmaWVsZCBhbmQgdmFsdWUgcGFpcnMgd2hlcmUgdGhlIGZpZWxkIGlzIHRoZSBpbmRleCBrZXkgYW5kIHRoZSB2YWx1ZSBkZXNjcmliZXMgdGhlIHR5cGUgb2YgaW5kZXggZm9yIHRoYXQgZmllbGQuIEZvciBhbiBhc2NlbmRpbmcgaW5kZXggb24gYSBmaWVsZCwgc3BlY2lmeSBhIHZhbHVlIG9mIGAxYDsgZm9yIGRlc2NlbmRpbmcgaW5kZXgsIHNwZWNpZnkgYSB2YWx1ZSBvZiBgLTFgLiBVc2UgYHRleHRgIGZvciB0ZXh0IGluZGV4ZXMuXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBbb3B0aW9uc10gQWxsIG9wdGlvbnMgYXJlIGxpc3RlZCBpbiBbTW9uZ29EQiBkb2N1bWVudGF0aW9uXShodHRwczovL2RvY3MubW9uZ29kYi5jb20vbWFudWFsL3JlZmVyZW5jZS9tZXRob2QvZGIuY29sbGVjdGlvbi5jcmVhdGVJbmRleC8jb3B0aW9ucylcbiAgICogQHBhcmFtIHtTdHJpbmd9IG9wdGlvbnMubmFtZSBOYW1lIG9mIHRoZSBpbmRleFxuICAgKiBAcGFyYW0ge0Jvb2xlYW59IG9wdGlvbnMudW5pcXVlIERlZmluZSB0aGF0IHRoZSBpbmRleCB2YWx1ZXMgbXVzdCBiZSB1bmlxdWUsIG1vcmUgYXQgW01vbmdvREIgZG9jdW1lbnRhdGlvbl0oaHR0cHM6Ly9kb2NzLm1vbmdvZGIuY29tL21hbnVhbC9jb3JlL2luZGV4LXVuaXF1ZS8pXG4gICAqIEBwYXJhbSB7Qm9vbGVhbn0gb3B0aW9ucy5zcGFyc2UgRGVmaW5lIHRoYXQgdGhlIGluZGV4IGlzIHNwYXJzZSwgbW9yZSBhdCBbTW9uZ29EQiBkb2N1bWVudGF0aW9uXShodHRwczovL2RvY3MubW9uZ29kYi5jb20vbWFudWFsL2NvcmUvaW5kZXgtc3BhcnNlLylcbiAgICovXG4gIGNyZWF0ZUluZGV4KGluZGV4LCBvcHRpb25zKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIGlmICghc2VsZi5fY29sbGVjdGlvbi5jcmVhdGVJbmRleClcbiAgICAgIHRocm93IG5ldyBFcnJvcignQ2FuIG9ubHkgY2FsbCBjcmVhdGVJbmRleCBvbiBzZXJ2ZXIgY29sbGVjdGlvbnMnKTtcbiAgICAvLyBbRklCRVJTXVxuICAgIC8vIFRPRE86IFJlbW92ZSB0aGlzIHdoZW4gMy4wIGlzIHJlbGVhc2VkLlxuICAgIHdhcm5Vc2luZ09sZEFwaShcbiAgICAgIFwiY3JlYXRlSW5kZXhcIixcbiAgICAgIHNlbGYuX25hbWUsXG4gICAgICBzZWxmLmNyZWF0ZUluZGV4LmlzQ2FsbGVkRnJvbUFzeW5jXG4gICAgKTtcbiAgICBzZWxmLmNyZWF0ZUluZGV4LmlzQ2FsbGVkRnJvbUFzeW5jID0gZmFsc2U7XG4gICAgdHJ5IHtcbiAgICAgIHNlbGYuX2NvbGxlY3Rpb24uY3JlYXRlSW5kZXgoaW5kZXgsIG9wdGlvbnMpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGlmIChlLm1lc3NhZ2UuaW5jbHVkZXMoJ0FuIGVxdWl2YWxlbnQgaW5kZXggYWxyZWFkeSBleGlzdHMgd2l0aCB0aGUgc2FtZSBuYW1lIGJ1dCBkaWZmZXJlbnQgb3B0aW9ucy4nKSAmJiBNZXRlb3Iuc2V0dGluZ3M/LnBhY2thZ2VzPy5tb25nbz8ucmVDcmVhdGVJbmRleE9uT3B0aW9uTWlzbWF0Y2gpIHtcbiAgICAgICAgaW1wb3J0IHsgTG9nIH0gZnJvbSAnbWV0ZW9yL2xvZ2dpbmcnO1xuXG4gICAgICAgIExvZy5pbmZvKGBSZS1jcmVhdGluZyBpbmRleCAke2luZGV4fSBmb3IgJHtzZWxmLl9uYW1lfSBkdWUgdG8gb3B0aW9ucyBtaXNtYXRjaC5gKTtcbiAgICAgICAgc2VsZi5fY29sbGVjdGlvbi5fZHJvcEluZGV4KGluZGV4KTtcbiAgICAgICAgc2VsZi5fY29sbGVjdGlvbi5jcmVhdGVJbmRleChpbmRleCwgb3B0aW9ucyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBuZXcgTWV0ZW9yLkVycm9yKGBBbiBlcnJvciBvY2N1cnJlZCB3aGVuIGNyZWF0aW5nIGFuIGluZGV4IGZvciBjb2xsZWN0aW9uIFwiJHtzZWxmLl9uYW1lfTogJHtlLm1lc3NhZ2V9YCk7XG4gICAgICB9XG4gICAgfVxuICB9LFxuXG4gIF9kcm9wSW5kZXgoaW5kZXgpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgaWYgKCFzZWxmLl9jb2xsZWN0aW9uLl9kcm9wSW5kZXgpXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0NhbiBvbmx5IGNhbGwgX2Ryb3BJbmRleCBvbiBzZXJ2ZXIgY29sbGVjdGlvbnMnKTtcbiAgICBzZWxmLl9jb2xsZWN0aW9uLl9kcm9wSW5kZXgoaW5kZXgpO1xuICB9LFxuXG4gIF9kcm9wQ29sbGVjdGlvbigpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgaWYgKCFzZWxmLl9jb2xsZWN0aW9uLmRyb3BDb2xsZWN0aW9uKVxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdDYW4gb25seSBjYWxsIF9kcm9wQ29sbGVjdGlvbiBvbiBzZXJ2ZXIgY29sbGVjdGlvbnMnKTtcbiAgICBzZWxmLl9jb2xsZWN0aW9uLmRyb3BDb2xsZWN0aW9uKCk7XG4gIH0sXG5cbiAgX2NyZWF0ZUNhcHBlZENvbGxlY3Rpb24oYnl0ZVNpemUsIG1heERvY3VtZW50cykge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICBpZiAoIXNlbGYuX2NvbGxlY3Rpb24uX2NyZWF0ZUNhcHBlZENvbGxlY3Rpb24pXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICdDYW4gb25seSBjYWxsIF9jcmVhdGVDYXBwZWRDb2xsZWN0aW9uIG9uIHNlcnZlciBjb2xsZWN0aW9ucydcbiAgICAgICk7XG5cbiAgICAvLyBbRklCRVJTXVxuICAgIC8vIFRPRE86IFJlbW92ZSB0aGlzIHdoZW4gMy4wIGlzIHJlbGVhc2VkLlxuICAgIHdhcm5Vc2luZ09sZEFwaShcbiAgICAgIFwiX2NyZWF0ZUNhcHBlZENvbGxlY3Rpb25cIixcbiAgICAgIHNlbGYuX25hbWUsXG4gICAgICBzZWxmLl9jcmVhdGVDYXBwZWRDb2xsZWN0aW9uLmlzQ2FsbGVkRnJvbUFzeW5jXG4gICAgKTtcbiAgICBzZWxmLl9jcmVhdGVDYXBwZWRDb2xsZWN0aW9uLmlzQ2FsbGVkRnJvbUFzeW5jID0gZmFsc2U7XG4gICAgc2VsZi5fY29sbGVjdGlvbi5fY3JlYXRlQ2FwcGVkQ29sbGVjdGlvbihieXRlU2l6ZSwgbWF4RG9jdW1lbnRzKTtcbiAgfSxcblxuICAvKipcbiAgICogQHN1bW1hcnkgUmV0dXJucyB0aGUgW2BDb2xsZWN0aW9uYF0oaHR0cDovL21vbmdvZGIuZ2l0aHViLmlvL25vZGUtbW9uZ29kYi1uYXRpdmUvMy4wL2FwaS9Db2xsZWN0aW9uLmh0bWwpIG9iamVjdCBjb3JyZXNwb25kaW5nIHRvIHRoaXMgY29sbGVjdGlvbiBmcm9tIHRoZSBbbnBtIGBtb25nb2RiYCBkcml2ZXIgbW9kdWxlXShodHRwczovL3d3dy5ucG1qcy5jb20vcGFja2FnZS9tb25nb2RiKSB3aGljaCBpcyB3cmFwcGVkIGJ5IGBNb25nby5Db2xsZWN0aW9uYC5cbiAgICogQGxvY3VzIFNlcnZlclxuICAgKiBAbWVtYmVyb2YgTW9uZ28uQ29sbGVjdGlvblxuICAgKiBAaW5zdGFuY2VcbiAgICovXG4gIHJhd0NvbGxlY3Rpb24oKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIGlmICghc2VsZi5fY29sbGVjdGlvbi5yYXdDb2xsZWN0aW9uKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0NhbiBvbmx5IGNhbGwgcmF3Q29sbGVjdGlvbiBvbiBzZXJ2ZXIgY29sbGVjdGlvbnMnKTtcbiAgICB9XG4gICAgcmV0dXJuIHNlbGYuX2NvbGxlY3Rpb24ucmF3Q29sbGVjdGlvbigpO1xuICB9LFxuXG4gIC8qKlxuICAgKiBAc3VtbWFyeSBSZXR1cm5zIHRoZSBbYERiYF0oaHR0cDovL21vbmdvZGIuZ2l0aHViLmlvL25vZGUtbW9uZ29kYi1uYXRpdmUvMy4wL2FwaS9EYi5odG1sKSBvYmplY3QgY29ycmVzcG9uZGluZyB0byB0aGlzIGNvbGxlY3Rpb24ncyBkYXRhYmFzZSBjb25uZWN0aW9uIGZyb20gdGhlIFtucG0gYG1vbmdvZGJgIGRyaXZlciBtb2R1bGVdKGh0dHBzOi8vd3d3Lm5wbWpzLmNvbS9wYWNrYWdlL21vbmdvZGIpIHdoaWNoIGlzIHdyYXBwZWQgYnkgYE1vbmdvLkNvbGxlY3Rpb25gLlxuICAgKiBAbG9jdXMgU2VydmVyXG4gICAqIEBtZW1iZXJvZiBNb25nby5Db2xsZWN0aW9uXG4gICAqIEBpbnN0YW5jZVxuICAgKi9cbiAgcmF3RGF0YWJhc2UoKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIGlmICghKHNlbGYuX2RyaXZlci5tb25nbyAmJiBzZWxmLl9kcml2ZXIubW9uZ28uZGIpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0NhbiBvbmx5IGNhbGwgcmF3RGF0YWJhc2Ugb24gc2VydmVyIGNvbGxlY3Rpb25zJyk7XG4gICAgfVxuICAgIHJldHVybiBzZWxmLl9kcml2ZXIubW9uZ28uZGI7XG4gIH0sXG59KTtcblxuLy8gQ29udmVydCB0aGUgY2FsbGJhY2sgdG8gbm90IHJldHVybiBhIHJlc3VsdCBpZiB0aGVyZSBpcyBhbiBlcnJvclxuZnVuY3Rpb24gd3JhcENhbGxiYWNrKGNhbGxiYWNrLCBjb252ZXJ0UmVzdWx0KSB7XG4gIHJldHVybiAoXG4gICAgY2FsbGJhY2sgJiZcbiAgICBmdW5jdGlvbihlcnJvciwgcmVzdWx0KSB7XG4gICAgICBpZiAoZXJyb3IpIHtcbiAgICAgICAgY2FsbGJhY2soZXJyb3IpO1xuICAgICAgfSBlbHNlIGlmICh0eXBlb2YgY29udmVydFJlc3VsdCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICBjYWxsYmFjayhlcnJvciwgY29udmVydFJlc3VsdChyZXN1bHQpKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNhbGxiYWNrKGVycm9yLCByZXN1bHQpO1xuICAgICAgfVxuICAgIH1cbiAgKTtcbn1cblxuLyoqXG4gKiBAc3VtbWFyeSBDcmVhdGUgYSBNb25nby1zdHlsZSBgT2JqZWN0SURgLiAgSWYgeW91IGRvbid0IHNwZWNpZnkgYSBgaGV4U3RyaW5nYCwgdGhlIGBPYmplY3RJRGAgd2lsbCBnZW5lcmF0ZWQgcmFuZG9tbHkgKG5vdCB1c2luZyBNb25nb0RCJ3MgSUQgY29uc3RydWN0aW9uIHJ1bGVzKS5cbiAqIEBsb2N1cyBBbnl3aGVyZVxuICogQGNsYXNzXG4gKiBAcGFyYW0ge1N0cmluZ30gW2hleFN0cmluZ10gT3B0aW9uYWwuICBUaGUgMjQtY2hhcmFjdGVyIGhleGFkZWNpbWFsIGNvbnRlbnRzIG9mIHRoZSBPYmplY3RJRCB0byBjcmVhdGVcbiAqL1xuTW9uZ28uT2JqZWN0SUQgPSBNb25nb0lELk9iamVjdElEO1xuXG4vKipcbiAqIEBzdW1tYXJ5IFRvIGNyZWF0ZSBhIGN1cnNvciwgdXNlIGZpbmQuIFRvIGFjY2VzcyB0aGUgZG9jdW1lbnRzIGluIGEgY3Vyc29yLCB1c2UgZm9yRWFjaCwgbWFwLCBvciBmZXRjaC5cbiAqIEBjbGFzc1xuICogQGluc3RhbmNlTmFtZSBjdXJzb3JcbiAqL1xuTW9uZ28uQ3Vyc29yID0gTG9jYWxDb2xsZWN0aW9uLkN1cnNvcjtcblxuLyoqXG4gKiBAZGVwcmVjYXRlZCBpbiAwLjkuMVxuICovXG5Nb25nby5Db2xsZWN0aW9uLkN1cnNvciA9IE1vbmdvLkN1cnNvcjtcblxuLyoqXG4gKiBAZGVwcmVjYXRlZCBpbiAwLjkuMVxuICovXG5Nb25nby5Db2xsZWN0aW9uLk9iamVjdElEID0gTW9uZ28uT2JqZWN0SUQ7XG5cbi8qKlxuICogQGRlcHJlY2F0ZWQgaW4gMC45LjFcbiAqL1xuTWV0ZW9yLkNvbGxlY3Rpb24gPSBNb25nby5Db2xsZWN0aW9uO1xuXG4vLyBBbGxvdyBkZW55IHN0dWZmIGlzIG5vdyBpbiB0aGUgYWxsb3ctZGVueSBwYWNrYWdlXG5PYmplY3QuYXNzaWduKE1vbmdvLkNvbGxlY3Rpb24ucHJvdG90eXBlLCBBbGxvd0RlbnkuQ29sbGVjdGlvblByb3RvdHlwZSk7XG5cbmZ1bmN0aW9uIHBvcENhbGxiYWNrRnJvbUFyZ3MoYXJncykge1xuICAvLyBQdWxsIG9mZiBhbnkgY2FsbGJhY2sgKG9yIHBlcmhhcHMgYSAnY2FsbGJhY2snIHZhcmlhYmxlIHRoYXQgd2FzIHBhc3NlZFxuICAvLyBpbiB1bmRlZmluZWQsIGxpa2UgaG93ICd1cHNlcnQnIGRvZXMgaXQpLlxuICBpZiAoXG4gICAgYXJncy5sZW5ndGggJiZcbiAgICAoYXJnc1thcmdzLmxlbmd0aCAtIDFdID09PSB1bmRlZmluZWQgfHxcbiAgICAgIGFyZ3NbYXJncy5sZW5ndGggLSAxXSBpbnN0YW5jZW9mIEZ1bmN0aW9uKVxuICApIHtcbiAgICByZXR1cm4gYXJncy5wb3AoKTtcbiAgfVxufVxuXG5cbkFTWU5DX0NPTExFQ1RJT05fTUVUSE9EUy5mb3JFYWNoKG1ldGhvZE5hbWUgPT4ge1xuICBjb25zdCBtZXRob2ROYW1lQXN5bmMgPSBnZXRBc3luY01ldGhvZE5hbWUobWV0aG9kTmFtZSk7XG4gIE1vbmdvLkNvbGxlY3Rpb24ucHJvdG90eXBlW21ldGhvZE5hbWVBc3luY10gPSBmdW5jdGlvbiguLi5hcmdzKSB7XG4gICAgdHJ5IHtcbiAgICAvLyBUT0RPOiBGaWJlcnMgcmVtb3ZlIHRoaXMgd2hlbiB3ZSByZW1vdmUgZmliZXJzLlxuICAgICAgdGhpc1ttZXRob2ROYW1lXS5pc0NhbGxlZEZyb21Bc3luYyA9IHRydWU7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRoaXNbbWV0aG9kTmFtZV0oLi4uYXJncykpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoZXJyb3IpO1xuICAgIH1cbiAgfTtcblxufSk7XG4iLCIvKipcbiAqIEBzdW1tYXJ5IEFsbG93cyBmb3IgdXNlciBzcGVjaWZpZWQgY29ubmVjdGlvbiBvcHRpb25zXG4gKiBAZXhhbXBsZSBodHRwOi8vbW9uZ29kYi5naXRodWIuaW8vbm9kZS1tb25nb2RiLW5hdGl2ZS8zLjAvcmVmZXJlbmNlL2Nvbm5lY3RpbmcvY29ubmVjdGlvbi1zZXR0aW5ncy9cbiAqIEBsb2N1cyBTZXJ2ZXJcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zIFVzZXIgc3BlY2lmaWVkIE1vbmdvIGNvbm5lY3Rpb24gb3B0aW9uc1xuICovXG5Nb25nby5zZXRDb25uZWN0aW9uT3B0aW9ucyA9IGZ1bmN0aW9uIHNldENvbm5lY3Rpb25PcHRpb25zIChvcHRpb25zKSB7XG4gIGNoZWNrKG9wdGlvbnMsIE9iamVjdCk7XG4gIE1vbmdvLl9jb25uZWN0aW9uT3B0aW9ucyA9IG9wdGlvbnM7XG59OyIsImV4cG9ydCBjb25zdCBub3JtYWxpemVQcm9qZWN0aW9uID0gb3B0aW9ucyA9PiB7XG4gIC8vIHRyYW5zZm9ybSBmaWVsZHMga2V5IGluIHByb2plY3Rpb25cbiAgY29uc3QgeyBmaWVsZHMsIHByb2plY3Rpb24sIC4uLm90aGVyT3B0aW9ucyB9ID0gb3B0aW9ucyB8fCB7fTtcbiAgLy8gVE9ETzogZW5hYmxlIHRoaXMgY29tbWVudCB3aGVuIGRlcHJlY2F0aW5nIHRoZSBmaWVsZHMgb3B0aW9uXG4gIC8vIExvZy5kZWJ1ZyhgZmllbGRzIG9wdGlvbiBoYXMgYmVlbiBkZXByZWNhdGVkLCBwbGVhc2UgdXNlIHRoZSBuZXcgJ3Byb2plY3Rpb24nIGluc3RlYWRgKVxuXG4gIHJldHVybiB7XG4gICAgLi4ub3RoZXJPcHRpb25zLFxuICAgIC4uLihwcm9qZWN0aW9uIHx8IGZpZWxkcyA/IHsgcHJvamVjdGlvbjogZmllbGRzIHx8IHByb2plY3Rpb24gfSA6IHt9KSxcbiAgfTtcbn07XG4iXX0=
