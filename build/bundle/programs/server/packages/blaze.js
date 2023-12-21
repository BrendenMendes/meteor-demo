(function () {

/* Imports */
var Meteor = Package.meteor.Meteor;
var global = Package.meteor.global;
var meteorEnv = Package.meteor.meteorEnv;
var Tracker = Package.tracker.Tracker;
var Deps = Package.tracker.Deps;
var check = Package.check.check;
var Match = Package.check.Match;
var ObserveSequence = Package['observe-sequence'].ObserveSequence;
var ReactiveVar = Package['reactive-var'].ReactiveVar;
var OrderedDict = Package['ordered-dict'].OrderedDict;
var ECMAScript = Package.ecmascript.ECMAScript;
var HTML = Package.htmljs.HTML;
var meteorInstall = Package.modules.meteorInstall;
var Promise = Package.promise.Promise;

/* Package-scope variables */
var Blaze, UI, Handlebars;

var require = meteorInstall({"node_modules":{"meteor":{"blaze":{"preamble.js":function module(){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/blaze/preamble.js                                                                                          //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
/**
 * @namespace Blaze
 * @summary The namespace for all Blaze-related methods and classes.
 */
Blaze = {};

// Utility to HTML-escape a string.  Included for legacy reasons.
// TODO: Should be replaced with _.escape once underscore is upgraded to a newer
//       version which escapes ` (backtick) as well. Underscore 1.5.2 does not.
Blaze._escape = function () {
  var escape_map = {
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#x27;",
    "/": "&#x2F;",
    "`": "&#x60;",
    /* IE allows backtick-delimited attributes?? */
    "&": "&amp;"
  };
  var escape_one = function (c) {
    return escape_map[c];
  };
  return function (x) {
    return x.replace(/[&<>"'`]/g, escape_one);
  };
}();
Blaze._warn = function (msg) {
  msg = 'Warning: ' + msg;
  if (typeof console !== 'undefined' && console.warn) {
    console.warn(msg);
  }
};
var nativeBind = Function.prototype.bind;

// An implementation of _.bind which allows better optimization.
// See: https://github.com/petkaantonov/bluebird/wiki/Optimization-killers#3-managing-arguments
if (nativeBind) {
  Blaze._bind = function (func, obj) {
    if (arguments.length === 2) {
      return nativeBind.call(func, obj);
    }

    // Copy the arguments so this function can be optimized.
    var args = new Array(arguments.length);
    for (var i = 0; i < args.length; i++) {
      args[i] = arguments[i];
    }
    return nativeBind.apply(func, args.slice(1));
  };
} else {
  // A slower but backwards compatible version.
  Blaze._bind = function (objA, objB) {
    objA.bind(objB);
  };
}
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"exceptions.js":function module(){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/blaze/exceptions.js                                                                                        //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
var debugFunc;

// We call into user code in many places, and it's nice to catch exceptions
// propagated from user code immediately so that the whole system doesn't just
// break.  Catching exceptions is easy; reporting them is hard.  This helper
// reports exceptions.
//
// Usage:
//
// ```
// try {
//   // ... someStuff ...
// } catch (e) {
//   reportUIException(e);
// }
// ```
//
// An optional second argument overrides the default message.

// Set this to `true` to cause `reportException` to throw
// the next exception rather than reporting it.  This is
// useful in unit tests that test error messages.
Blaze._throwNextException = false;
Blaze._reportException = function (e, msg) {
  if (Blaze._throwNextException) {
    Blaze._throwNextException = false;
    throw e;
  }
  if (!debugFunc)
    // adapted from Tracker
    debugFunc = function () {
      return typeof Meteor !== "undefined" ? Meteor._debug : typeof console !== "undefined" && console.log ? console.log : function () {};
    };

  // In Chrome, `e.stack` is a multiline string that starts with the message
  // and contains a stack trace.  Furthermore, `console.log` makes it clickable.
  // `console.log` supplies the space between the two arguments.
  debugFunc()(msg || 'Exception caught in template:', e.stack || e.message || e);
};
Blaze._wrapCatchingExceptions = function (f, where) {
  if (typeof f !== 'function') return f;
  return function () {
    try {
      return f.apply(this, arguments);
    } catch (e) {
      Blaze._reportException(e, 'Exception in ' + where + ':');
    }
  };
};
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"view.js":function module(){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/blaze/view.js                                                                                              //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
/// [new] Blaze.View([name], renderMethod)
///
/// Blaze.View is the building block of reactive DOM.  Views have
/// the following features:
///
/// * lifecycle callbacks - Views are created, rendered, and destroyed,
///   and callbacks can be registered to fire when these things happen.
///
/// * parent pointer - A View points to its parentView, which is the
///   View that caused it to be rendered.  These pointers form a
///   hierarchy or tree of Views.
///
/// * render() method - A View's render() method specifies the DOM
///   (or HTML) content of the View.  If the method establishes
///   reactive dependencies, it may be re-run.
///
/// * a DOMRange - If a View is rendered to DOM, its position and
///   extent in the DOM are tracked using a DOMRange object.
///
/// When a View is constructed by calling Blaze.View, the View is
/// not yet considered "created."  It doesn't have a parentView yet,
/// and no logic has been run to initialize the View.  All real
/// work is deferred until at least creation time, when the onViewCreated
/// callbacks are fired, which happens when the View is "used" in
/// some way that requires it to be rendered.
///
/// ...more lifecycle stuff
///
/// `name` is an optional string tag identifying the View.  The only
/// time it's used is when looking in the View tree for a View of a
/// particular name; for example, data contexts are stored on Views
/// of name "with".  Names are also useful when debugging, so in
/// general it's good for functions that create Views to set the name.
/// Views associated with templates have names of the form "Template.foo".

/**
 * @class
 * @summary Constructor for a View, which represents a reactive region of DOM.
 * @locus Client
 * @param {String} [name] Optional.  A name for this type of View.  See [`view.name`](#view_name).
 * @param {Function} renderFunction A function that returns [*renderable content*](#Renderable-Content).  In this function, `this` is bound to the View.
 */
Blaze.View = function (name, render) {
  if (!(this instanceof Blaze.View))
    // called without `new`
    return new Blaze.View(name, render);
  if (typeof name === 'function') {
    // omitted "name" argument
    render = name;
    name = '';
  }
  this.name = name;
  this._render = render;
  this._callbacks = {
    created: null,
    rendered: null,
    destroyed: null
  };

  // Setting all properties here is good for readability,
  // and also may help Chrome optimize the code by keeping
  // the View object from changing shape too much.
  this.isCreated = false;
  this._isCreatedForExpansion = false;
  this.isRendered = false;
  this._isAttached = false;
  this.isDestroyed = false;
  this._isInRender = false;
  this.parentView = null;
  this._domrange = null;
  // This flag is normally set to false except for the cases when view's parent
  // was generated as part of expanding some syntactic sugar expressions or
  // methods.
  // Ex.: Blaze.renderWithData is an equivalent to creating a view with regular
  // Blaze.render and wrapping it into {{#with data}}{{/with}} view. Since the
  // users don't know anything about these generated parent views, Blaze needs
  // this information to be available on views to make smarter decisions. For
  // example: removing the generated parent view with the view on Blaze.remove.
  this._hasGeneratedParent = false;
  // Bindings accessible to children views (via view.lookup('name')) within the
  // closest template view.
  this._scopeBindings = {};
  this.renderCount = 0;
};
Blaze.View.prototype._render = function () {
  return null;
};
Blaze.View.prototype.onViewCreated = function (cb) {
  this._callbacks.created = this._callbacks.created || [];
  this._callbacks.created.push(cb);
};
Blaze.View.prototype._onViewRendered = function (cb) {
  this._callbacks.rendered = this._callbacks.rendered || [];
  this._callbacks.rendered.push(cb);
};
Blaze.View.prototype.onViewReady = function (cb) {
  var self = this;
  var fire = function () {
    Tracker.afterFlush(function () {
      if (!self.isDestroyed) {
        Blaze._withCurrentView(self, function () {
          cb.call(self);
        });
      }
    });
  };
  self._onViewRendered(function onViewRendered() {
    if (self.isDestroyed) return;
    if (!self._domrange.attached) self._domrange.onAttached(fire);else fire();
  });
};
Blaze.View.prototype.onViewDestroyed = function (cb) {
  this._callbacks.destroyed = this._callbacks.destroyed || [];
  this._callbacks.destroyed.push(cb);
};
Blaze.View.prototype.removeViewDestroyedListener = function (cb) {
  var destroyed = this._callbacks.destroyed;
  if (!destroyed) return;
  var index = destroyed.lastIndexOf(cb);
  if (index !== -1) {
    // XXX You'd think the right thing to do would be splice, but _fireCallbacks
    // gets sad if you remove callbacks while iterating over the list.  Should
    // change this to use callback-hook or EventEmitter or something else that
    // properly supports removal.
    destroyed[index] = null;
  }
};

/// View#autorun(func)
///
/// Sets up a Tracker autorun that is "scoped" to this View in two
/// important ways: 1) Blaze.currentView is automatically set
/// on every re-run, and 2) the autorun is stopped when the
/// View is destroyed.  As with Tracker.autorun, the first run of
/// the function is immediate, and a Computation object that can
/// be used to stop the autorun is returned.
///
/// View#autorun is meant to be called from View callbacks like
/// onViewCreated, or from outside the rendering process.  It may not
/// be called before the onViewCreated callbacks are fired (too early),
/// or from a render() method (too confusing).
///
/// Typically, autoruns that update the state
/// of the View (as in Blaze.With) should be started from an onViewCreated
/// callback.  Autoruns that update the DOM should be started
/// from either onViewCreated (guarded against the absence of
/// view._domrange), or onViewReady.
Blaze.View.prototype.autorun = function (f, _inViewScope, displayName) {
  var self = this;

  // The restrictions on when View#autorun can be called are in order
  // to avoid bad patterns, like creating a Blaze.View and immediately
  // calling autorun on it.  A freshly created View is not ready to
  // have logic run on it; it doesn't have a parentView, for example.
  // It's when the View is materialized or expanded that the onViewCreated
  // handlers are fired and the View starts up.
  //
  // Letting the render() method call `this.autorun()` is problematic
  // because of re-render.  The best we can do is to stop the old
  // autorun and start a new one for each render, but that's a pattern
  // we try to avoid internally because it leads to helpers being
  // called extra times, in the case where the autorun causes the
  // view to re-render (and thus the autorun to be torn down and a
  // new one established).
  //
  // We could lift these restrictions in various ways.  One interesting
  // idea is to allow you to call `view.autorun` after instantiating
  // `view`, and automatically wrap it in `view.onViewCreated`, deferring
  // the autorun so that it starts at an appropriate time.  However,
  // then we can't return the Computation object to the caller, because
  // it doesn't exist yet.
  if (!self.isCreated) {
    throw new Error("View#autorun must be called from the created callback at the earliest");
  }
  if (this._isInRender) {
    throw new Error("Can't call View#autorun from inside render(); try calling it from the created or rendered callback");
  }
  var templateInstanceFunc = Blaze.Template._currentTemplateInstanceFunc;
  var func = function viewAutorun(c) {
    return Blaze._withCurrentView(_inViewScope || self, function () {
      return Blaze.Template._withTemplateInstanceFunc(templateInstanceFunc, function () {
        return f.call(self, c);
      });
    });
  };

  // Give the autorun function a better name for debugging and profiling.
  // The `displayName` property is not part of the spec but browsers like Chrome
  // and Firefox prefer it in debuggers over the name function was declared by.
  func.displayName = (self.name || 'anonymous') + ':' + (displayName || 'anonymous');
  var comp = Tracker.autorun(func);
  var stopComputation = function () {
    comp.stop();
  };
  self.onViewDestroyed(stopComputation);
  comp.onStop(function () {
    self.removeViewDestroyedListener(stopComputation);
  });
  return comp;
};
Blaze.View.prototype._errorIfShouldntCallSubscribe = function () {
  var self = this;
  if (!self.isCreated) {
    throw new Error("View#subscribe must be called from the created callback at the earliest");
  }
  if (self._isInRender) {
    throw new Error("Can't call View#subscribe from inside render(); try calling it from the created or rendered callback");
  }
  if (self.isDestroyed) {
    throw new Error("Can't call View#subscribe from inside the destroyed callback, try calling it inside created or rendered.");
  }
};

/**
 * Just like Blaze.View#autorun, but with Meteor.subscribe instead of
 * Tracker.autorun. Stop the subscription when the view is destroyed.
 * @return {SubscriptionHandle} A handle to the subscription so that you can
 * see if it is ready, or stop it manually
 */
Blaze.View.prototype.subscribe = function (args, options) {
  var self = this;
  options = options || {};
  self._errorIfShouldntCallSubscribe();
  var subHandle;
  if (options.connection) {
    subHandle = options.connection.subscribe.apply(options.connection, args);
  } else {
    subHandle = Meteor.subscribe.apply(Meteor, args);
  }
  self.onViewDestroyed(function () {
    subHandle.stop();
  });
  return subHandle;
};
Blaze.View.prototype.firstNode = function () {
  if (!this._isAttached) throw new Error("View must be attached before accessing its DOM");
  return this._domrange.firstNode();
};
Blaze.View.prototype.lastNode = function () {
  if (!this._isAttached) throw new Error("View must be attached before accessing its DOM");
  return this._domrange.lastNode();
};
Blaze._fireCallbacks = function (view, which) {
  Blaze._withCurrentView(view, function () {
    Tracker.nonreactive(function fireCallbacks() {
      var cbs = view._callbacks[which];
      for (var i = 0, N = cbs && cbs.length; i < N; i++) cbs[i] && cbs[i].call(view);
    });
  });
};
Blaze._createView = function (view, parentView, forExpansion) {
  if (view.isCreated) throw new Error("Can't render the same View twice");
  view.parentView = parentView || null;
  view.isCreated = true;
  if (forExpansion) view._isCreatedForExpansion = true;
  Blaze._fireCallbacks(view, 'created');
};
var doFirstRender = function (view, initialContent) {
  var domrange = new Blaze._DOMRange(initialContent);
  view._domrange = domrange;
  domrange.view = view;
  view.isRendered = true;
  Blaze._fireCallbacks(view, 'rendered');
  var teardownHook = null;
  domrange.onAttached(function attached(range, element) {
    view._isAttached = true;
    teardownHook = Blaze._DOMBackend.Teardown.onElementTeardown(element, function teardown() {
      Blaze._destroyView(view, true /* _skipNodes */);
    });
  });

  // tear down the teardown hook
  view.onViewDestroyed(function () {
    teardownHook && teardownHook.stop();
    teardownHook = null;
  });
  return domrange;
};

// Take an uncreated View `view` and create and render it to DOM,
// setting up the autorun that updates the View.  Returns a new
// DOMRange, which has been associated with the View.
//
// The private arguments `_workStack` and `_intoArray` are passed in
// by Blaze._materializeDOM and are only present for recursive calls
// (when there is some other _materializeView on the stack).  If
// provided, then we avoid the mutual recursion of calling back into
// Blaze._materializeDOM so that deep View hierarchies don't blow the
// stack.  Instead, we push tasks onto workStack for the initial
// rendering and subsequent setup of the View, and they are done after
// we return.  When there is a _workStack, we do not return the new
// DOMRange, but instead push it into _intoArray from a _workStack
// task.
Blaze._materializeView = function (view, parentView, _workStack, _intoArray) {
  Blaze._createView(view, parentView);
  var domrange;
  var lastHtmljs;
  // We don't expect to be called in a Computation, but just in case,
  // wrap in Tracker.nonreactive.
  Tracker.nonreactive(function () {
    view.autorun(function doRender(c) {
      // `view.autorun` sets the current view.
      view.renderCount++;
      view._isInRender = true;
      // Any dependencies that should invalidate this Computation come
      // from this line:
      var htmljs = view._render();
      view._isInRender = false;
      if (!c.firstRun && !Blaze._isContentEqual(lastHtmljs, htmljs)) {
        Tracker.nonreactive(function doMaterialize() {
          // re-render
          var rangesAndNodes = Blaze._materializeDOM(htmljs, [], view);
          domrange.setMembers(rangesAndNodes);
          Blaze._fireCallbacks(view, 'rendered');
        });
      }
      lastHtmljs = htmljs;

      // Causes any nested views to stop immediately, not when we call
      // `setMembers` the next time around the autorun.  Otherwise,
      // helpers in the DOM tree to be replaced might be scheduled
      // to re-run before we have a chance to stop them.
      Tracker.onInvalidate(function () {
        if (domrange) {
          domrange.destroyMembers();
        }
      });
    }, undefined, 'materialize');

    // first render.  lastHtmljs is the first htmljs.
    var initialContents;
    if (!_workStack) {
      initialContents = Blaze._materializeDOM(lastHtmljs, [], view);
      domrange = doFirstRender(view, initialContents);
      initialContents = null; // help GC because we close over this scope a lot
    } else {
      // We're being called from Blaze._materializeDOM, so to avoid
      // recursion and save stack space, provide a description of the
      // work to be done instead of doing it.  Tasks pushed onto
      // _workStack will be done in LIFO order after we return.
      // The work will still be done within a Tracker.nonreactive,
      // because it will be done by some call to Blaze._materializeDOM
      // (which is always called in a Tracker.nonreactive).
      initialContents = [];
      // push this function first so that it happens last
      _workStack.push(function () {
        domrange = doFirstRender(view, initialContents);
        initialContents = null; // help GC because of all the closures here
        _intoArray.push(domrange);
      });
      // now push the task that calculates initialContents
      _workStack.push(Blaze._bind(Blaze._materializeDOM, null, lastHtmljs, initialContents, view, _workStack));
    }
  });
  if (!_workStack) {
    return domrange;
  } else {
    return null;
  }
};

// Expands a View to HTMLjs, calling `render` recursively on all
// Views and evaluating any dynamic attributes.  Calls the `created`
// callback, but not the `materialized` or `rendered` callbacks.
// Destroys the view immediately, unless called in a Tracker Computation,
// in which case the view will be destroyed when the Computation is
// invalidated.  If called in a Tracker Computation, the result is a
// reactive string; that is, the Computation will be invalidated
// if any changes are made to the view or subviews that might affect
// the HTML.
Blaze._expandView = function (view, parentView) {
  Blaze._createView(view, parentView, true /*forExpansion*/);

  view._isInRender = true;
  var htmljs = Blaze._withCurrentView(view, function () {
    return view._render();
  });
  view._isInRender = false;
  var result = Blaze._expand(htmljs, view);
  if (Tracker.active) {
    Tracker.onInvalidate(function () {
      Blaze._destroyView(view);
    });
  } else {
    Blaze._destroyView(view);
  }
  return result;
};

// Options: `parentView`
Blaze._HTMLJSExpander = HTML.TransformingVisitor.extend();
Blaze._HTMLJSExpander.def({
  visitObject: function (x) {
    if (x instanceof Blaze.Template) x = x.constructView();
    if (x instanceof Blaze.View) return Blaze._expandView(x, this.parentView);

    // this will throw an error; other objects are not allowed!
    return HTML.TransformingVisitor.prototype.visitObject.call(this, x);
  },
  visitAttributes: function (attrs) {
    // expand dynamic attributes
    if (typeof attrs === 'function') attrs = Blaze._withCurrentView(this.parentView, attrs);

    // call super (e.g. for case where `attrs` is an array)
    return HTML.TransformingVisitor.prototype.visitAttributes.call(this, attrs);
  },
  visitAttribute: function (name, value, tag) {
    // expand attribute values that are functions.  Any attribute value
    // that contains Views must be wrapped in a function.
    if (typeof value === 'function') value = Blaze._withCurrentView(this.parentView, value);
    return HTML.TransformingVisitor.prototype.visitAttribute.call(this, name, value, tag);
  }
});

// Return Blaze.currentView, but only if it is being rendered
// (i.e. we are in its render() method).
var currentViewIfRendering = function () {
  var view = Blaze.currentView;
  return view && view._isInRender ? view : null;
};
Blaze._expand = function (htmljs, parentView) {
  parentView = parentView || currentViewIfRendering();
  return new Blaze._HTMLJSExpander({
    parentView: parentView
  }).visit(htmljs);
};
Blaze._expandAttributes = function (attrs, parentView) {
  parentView = parentView || currentViewIfRendering();
  return new Blaze._HTMLJSExpander({
    parentView: parentView
  }).visitAttributes(attrs);
};
Blaze._destroyView = function (view, _skipNodes) {
  if (view.isDestroyed) return;
  view.isDestroyed = true;

  // Destroy views and elements recursively.  If _skipNodes,
  // only recurse up to views, not elements, for the case where
  // the backend (jQuery) is recursing over the elements already.

  if (view._domrange) view._domrange.destroyMembers(_skipNodes);

  // XXX: fire callbacks after potential members are destroyed
  // otherwise it's tracker.flush will cause the above line will
  // not be called and their views won't be destroyed
  // Involved issues: DOMRange "Must be attached" error, mem leak

  Blaze._fireCallbacks(view, 'destroyed');
};
Blaze._destroyNode = function (node) {
  if (node.nodeType === 1) Blaze._DOMBackend.Teardown.tearDownElement(node);
};

// Are the HTMLjs entities `a` and `b` the same?  We could be
// more elaborate here but the point is to catch the most basic
// cases.
Blaze._isContentEqual = function (a, b) {
  if (a instanceof HTML.Raw) {
    return b instanceof HTML.Raw && a.value === b.value;
  } else if (a == null) {
    return b == null;
  } else {
    return a === b && (typeof a === 'number' || typeof a === 'boolean' || typeof a === 'string');
  }
};

/**
 * @summary The View corresponding to the current template helper, event handler, callback, or autorun.  If there isn't one, `null`.
 * @locus Client
 * @type {Blaze.View}
 */
Blaze.currentView = null;
Blaze._withCurrentView = function (view, func) {
  var oldView = Blaze.currentView;
  try {
    Blaze.currentView = view;
    return func();
  } finally {
    Blaze.currentView = oldView;
  }
};

// Blaze.render publicly takes a View or a Template.
// Privately, it takes any HTMLJS (extended with Views and Templates)
// except null or undefined, or a function that returns any extended
// HTMLJS.
var checkRenderContent = function (content) {
  if (content === null) throw new Error("Can't render null");
  if (typeof content === 'undefined') throw new Error("Can't render undefined");
  if (content instanceof Blaze.View || content instanceof Blaze.Template || typeof content === 'function') return;
  try {
    // Throw if content doesn't look like HTMLJS at the top level
    // (i.e. verify that this is an HTML.Tag, or an array,
    // or a primitive, etc.)
    new HTML.Visitor().visit(content);
  } catch (e) {
    // Make error message suitable for public API
    throw new Error("Expected Template or View");
  }
};

// For Blaze.render and Blaze.toHTML, take content and
// wrap it in a View, unless it's a single View or
// Template already.
var contentAsView = function (content) {
  checkRenderContent(content);
  if (content instanceof Blaze.Template) {
    return content.constructView();
  } else if (content instanceof Blaze.View) {
    return content;
  } else {
    var func = content;
    if (typeof func !== 'function') {
      func = function () {
        return content;
      };
    }
    return Blaze.View('render', func);
  }
};

// For Blaze.renderWithData and Blaze.toHTMLWithData, wrap content
// in a function, if necessary, so it can be a content arg to
// a Blaze.With.
var contentAsFunc = function (content) {
  checkRenderContent(content);
  if (typeof content !== 'function') {
    return function () {
      return content;
    };
  } else {
    return content;
  }
};
Blaze.__rootViews = [];

/**
 * @summary Renders a template or View to DOM nodes and inserts it into the DOM, returning a rendered [View](#Blaze-View) which can be passed to [`Blaze.remove`](#Blaze-remove).
 * @locus Client
 * @param {Template|Blaze.View} templateOrView The template (e.g. `Template.myTemplate`) or View object to render.  If a template, a View object is [constructed](#template_constructview).  If a View, it must be an unrendered View, which becomes a rendered View and is returned.
 * @param {DOMNode} parentNode The node that will be the parent of the rendered template.  It must be an Element node.
 * @param {DOMNode} [nextNode] Optional. If provided, must be a child of <em>parentNode</em>; the template will be inserted before this node. If not provided, the template will be inserted as the last child of parentNode.
 * @param {Blaze.View} [parentView] Optional. If provided, it will be set as the rendered View's [`parentView`](#view_parentview).
 */
Blaze.render = function (content, parentElement, nextNode, parentView) {
  if (!parentElement) {
    Blaze._warn("Blaze.render without a parent element is deprecated. " + "You must specify where to insert the rendered content.");
  }
  if (nextNode instanceof Blaze.View) {
    // handle omitted nextNode
    parentView = nextNode;
    nextNode = null;
  }

  // parentElement must be a DOM node. in particular, can't be the
  // result of a call to `$`. Can't check if `parentElement instanceof
  // Node` since 'Node' is undefined in IE8.
  if (parentElement && typeof parentElement.nodeType !== 'number') throw new Error("'parentElement' must be a DOM node");
  if (nextNode && typeof nextNode.nodeType !== 'number')
    // 'nextNode' is optional
    throw new Error("'nextNode' must be a DOM node");
  parentView = parentView || currentViewIfRendering();
  var view = contentAsView(content);

  // TODO: this is only needed in development
  if (!parentView) {
    view.onViewCreated(function () {
      Blaze.__rootViews.push(view);
    });
    view.onViewDestroyed(function () {
      var index = Blaze.__rootViews.indexOf(view);
      if (index > -1) {
        Blaze.__rootViews.splice(index, 1);
      }
    });
  }
  Blaze._materializeView(view, parentView);
  if (parentElement) {
    view._domrange.attach(parentElement, nextNode);
  }
  return view;
};
Blaze.insert = function (view, parentElement, nextNode) {
  Blaze._warn("Blaze.insert has been deprecated.  Specify where to insert the " + "rendered content in the call to Blaze.render.");
  if (!(view && view._domrange instanceof Blaze._DOMRange)) throw new Error("Expected template rendered with Blaze.render");
  view._domrange.attach(parentElement, nextNode);
};

/**
 * @summary Renders a template or View to DOM nodes with a data context.  Otherwise identical to `Blaze.render`.
 * @locus Client
 * @param {Template|Blaze.View} templateOrView The template (e.g. `Template.myTemplate`) or View object to render.
 * @param {Object|Function} data The data context to use, or a function returning a data context.  If a function is provided, it will be reactively re-run.
 * @param {DOMNode} parentNode The node that will be the parent of the rendered template.  It must be an Element node.
 * @param {DOMNode} [nextNode] Optional. If provided, must be a child of <em>parentNode</em>; the template will be inserted before this node. If not provided, the template will be inserted as the last child of parentNode.
 * @param {Blaze.View} [parentView] Optional. If provided, it will be set as the rendered View's [`parentView`](#view_parentview).
 */
Blaze.renderWithData = function (content, data, parentElement, nextNode, parentView) {
  // We defer the handling of optional arguments to Blaze.render.  At this point,
  // `nextNode` may actually be `parentView`.
  return Blaze.render(Blaze._TemplateWith(data, contentAsFunc(content)), parentElement, nextNode, parentView);
};

/**
 * @summary Removes a rendered View from the DOM, stopping all reactive updates and event listeners on it. Also destroys the Blaze.Template instance associated with the view.
 * @locus Client
 * @param {Blaze.View} renderedView The return value from `Blaze.render` or `Blaze.renderWithData`, or the `view` property of a Blaze.Template instance. Calling `Blaze.remove(Template.instance().view)` from within a template event handler will destroy the view as well as that template and trigger the template's `onDestroyed` handlers.
 */
Blaze.remove = function (view) {
  if (!(view && view._domrange instanceof Blaze._DOMRange)) throw new Error("Expected template rendered with Blaze.render");
  while (view) {
    if (!view.isDestroyed) {
      var range = view._domrange;
      range.destroy();
      if (range.attached && !range.parentRange) {
        range.detach();
      }
    }
    view = view._hasGeneratedParent && view.parentView;
  }
};

/**
 * @summary Renders a template or View to a string of HTML.
 * @locus Client
 * @param {Template|Blaze.View} templateOrView The template (e.g. `Template.myTemplate`) or View object from which to generate HTML.
 */
Blaze.toHTML = function (content, parentView) {
  parentView = parentView || currentViewIfRendering();
  return HTML.toHTML(Blaze._expandView(contentAsView(content), parentView));
};

/**
 * @summary Renders a template or View to HTML with a data context.  Otherwise identical to `Blaze.toHTML`.
 * @locus Client
 * @param {Template|Blaze.View} templateOrView The template (e.g. `Template.myTemplate`) or View object from which to generate HTML.
 * @param {Object|Function} data The data context to use, or a function returning a data context.
 */
Blaze.toHTMLWithData = function (content, data, parentView) {
  parentView = parentView || currentViewIfRendering();
  return HTML.toHTML(Blaze._expandView(Blaze._TemplateWith(data, contentAsFunc(content)), parentView));
};
Blaze._toText = function (htmljs, parentView, textMode) {
  if (typeof htmljs === 'function') throw new Error("Blaze._toText doesn't take a function, just HTMLjs");
  if (parentView != null && !(parentView instanceof Blaze.View)) {
    // omitted parentView argument
    textMode = parentView;
    parentView = null;
  }
  parentView = parentView || currentViewIfRendering();
  if (!textMode) throw new Error("textMode required");
  if (!(textMode === HTML.TEXTMODE.STRING || textMode === HTML.TEXTMODE.RCDATA || textMode === HTML.TEXTMODE.ATTRIBUTE)) throw new Error("Unknown textMode: " + textMode);
  return HTML.toText(Blaze._expand(htmljs, parentView), textMode);
};

/**
 * @summary Returns the current data context, or the data context that was used when rendering a particular DOM element or View from a Meteor template.
 * @locus Client
 * @param {DOMElement|Blaze.View} [elementOrView] Optional.  An element that was rendered by a Meteor, or a View.
 */
Blaze.getData = function (elementOrView) {
  var theWith;
  if (!elementOrView) {
    theWith = Blaze.getView('with');
  } else if (elementOrView instanceof Blaze.View) {
    var view = elementOrView;
    theWith = view.name === 'with' ? view : Blaze.getView(view, 'with');
  } else if (typeof elementOrView.nodeType === 'number') {
    if (elementOrView.nodeType !== 1) throw new Error("Expected DOM element");
    theWith = Blaze.getView(elementOrView, 'with');
  } else {
    throw new Error("Expected DOM element or View");
  }
  return theWith ? theWith.dataVar.get() : null;
};

// For back-compat
Blaze.getElementData = function (element) {
  Blaze._warn("Blaze.getElementData has been deprecated.  Use " + "Blaze.getData(element) instead.");
  if (element.nodeType !== 1) throw new Error("Expected DOM element");
  return Blaze.getData(element);
};

// Both arguments are optional.

/**
 * @summary Gets either the current View, or the View enclosing the given DOM element.
 * @locus Client
 * @param {DOMElement} [element] Optional.  If specified, the View enclosing `element` is returned.
 */
Blaze.getView = function (elementOrView, _viewName) {
  var viewName = _viewName;
  if (typeof elementOrView === 'string') {
    // omitted elementOrView; viewName present
    viewName = elementOrView;
    elementOrView = null;
  }

  // We could eventually shorten the code by folding the logic
  // from the other methods into this method.
  if (!elementOrView) {
    return Blaze._getCurrentView(viewName);
  } else if (elementOrView instanceof Blaze.View) {
    return Blaze._getParentView(elementOrView, viewName);
  } else if (typeof elementOrView.nodeType === 'number') {
    return Blaze._getElementView(elementOrView, viewName);
  } else {
    throw new Error("Expected DOM element or View");
  }
};

// Gets the current view or its nearest ancestor of name
// `name`.
Blaze._getCurrentView = function (name) {
  var view = Blaze.currentView;
  // Better to fail in cases where it doesn't make sense
  // to use Blaze._getCurrentView().  There will be a current
  // view anywhere it does.  You can check Blaze.currentView
  // if you want to know whether there is one or not.
  if (!view) throw new Error("There is no current view");
  if (name) {
    while (view && view.name !== name) view = view.parentView;
    return view || null;
  } else {
    // Blaze._getCurrentView() with no arguments just returns
    // Blaze.currentView.
    return view;
  }
};
Blaze._getParentView = function (view, name) {
  var v = view.parentView;
  if (name) {
    while (v && v.name !== name) v = v.parentView;
  }
  return v || null;
};
Blaze._getElementView = function (elem, name) {
  var range = Blaze._DOMRange.forElement(elem);
  var view = null;
  while (range && !view) {
    view = range.view || null;
    if (!view) {
      if (range.parentRange) range = range.parentRange;else range = Blaze._DOMRange.forElement(range.parentElement);
    }
  }
  if (name) {
    while (view && view.name !== name) view = view.parentView;
    return view || null;
  } else {
    return view;
  }
};
Blaze._addEventMap = function (view, eventMap, thisInHandler) {
  thisInHandler = thisInHandler || null;
  var handles = [];
  if (!view._domrange) throw new Error("View must have a DOMRange");
  view._domrange.onAttached(function attached_eventMaps(range, element) {
    Object.keys(eventMap).forEach(function (spec) {
      let handler = eventMap[spec];
      var clauses = spec.split(/,\s+/);
      // iterate over clauses of spec, e.g. ['click .foo', 'click .bar']
      clauses.forEach(function (clause) {
        var parts = clause.split(/\s+/);
        if (parts.length === 0) return;
        var newEvents = parts.shift();
        var selector = parts.join(' ');
        handles.push(Blaze._EventSupport.listen(element, newEvents, selector, function (evt) {
          if (!range.containsElement(evt.currentTarget, selector, newEvents)) return null;
          var handlerThis = thisInHandler || this;
          var handlerArgs = arguments;
          return Blaze._withCurrentView(view, function () {
            return handler.apply(handlerThis, handlerArgs);
          });
        }, range, function (r) {
          return r.parentRange;
        }));
      });
    });
  });
  view.onViewDestroyed(function () {
    handles.forEach(function (h) {
      h.stop();
    });
    handles.length = 0;
  });
};
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"builtins.js":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/blaze/builtins.js                                                                                          //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
let has;
module.link("lodash.has", {
  default(v) {
    has = v;
  }
}, 0);
let isObject;
module.link("lodash.isobject", {
  default(v) {
    isObject = v;
  }
}, 1);
Blaze._calculateCondition = function (cond) {
  if (HTML.isArray(cond) && cond.length === 0) cond = false;
  return !!cond;
};

/**
 * @summary Constructs a View that renders content with a data context.
 * @locus Client
 * @param {Object|Function} data An object to use as the data context, or a function returning such an object.  If a function is provided, it will be reactively re-run.
 * @param {Function} contentFunc A Function that returns [*renderable content*](#Renderable-Content).
 */
Blaze.With = function (data, contentFunc) {
  var view = Blaze.View('with', contentFunc);
  view.dataVar = new ReactiveVar();
  view.onViewCreated(function () {
    if (typeof data === 'function') {
      // `data` is a reactive function
      view.autorun(function () {
        view.dataVar.set(data());
      }, view.parentView, 'setData');
    } else {
      view.dataVar.set(data);
    }
  });
  return view;
};

/**
 * Attaches bindings to the instantiated view.
 * @param {Object} bindings A dictionary of bindings, each binding name
 * corresponds to a value or a function that will be reactively re-run.
 * @param {View} view The target.
 */
Blaze._attachBindingsToView = function (bindings, view) {
  view.onViewCreated(function () {
    Object.entries(bindings).forEach(function (_ref) {
      let [name, binding] = _ref;
      view._scopeBindings[name] = new ReactiveVar();
      if (typeof binding === 'function') {
        view.autorun(function () {
          view._scopeBindings[name].set(binding());
        }, view.parentView);
      } else {
        view._scopeBindings[name].set(binding);
      }
    });
  });
};

/**
 * @summary Constructs a View setting the local lexical scope in the block.
 * @param {Function} bindings Dictionary mapping names of bindings to
 * values or computations to reactively re-run.
 * @param {Function} contentFunc A Function that returns [*renderable content*](#Renderable-Content).
 */
Blaze.Let = function (bindings, contentFunc) {
  var view = Blaze.View('let', contentFunc);
  Blaze._attachBindingsToView(bindings, view);
  return view;
};

/**
 * @summary Constructs a View that renders content conditionally.
 * @locus Client
 * @param {Function} conditionFunc A function to reactively re-run.  Whether the result is truthy or falsy determines whether `contentFunc` or `elseFunc` is shown.  An empty array is considered falsy.
 * @param {Function} contentFunc A Function that returns [*renderable content*](#Renderable-Content).
 * @param {Function} [elseFunc] Optional.  A Function that returns [*renderable content*](#Renderable-Content).  If no `elseFunc` is supplied, no content is shown in the "else" case.
 */
Blaze.If = function (conditionFunc, contentFunc, elseFunc, _not) {
  var conditionVar = new ReactiveVar();
  var view = Blaze.View(_not ? 'unless' : 'if', function () {
    return conditionVar.get() ? contentFunc() : elseFunc ? elseFunc() : null;
  });
  view.__conditionVar = conditionVar;
  view.onViewCreated(function () {
    this.autorun(function () {
      var cond = Blaze._calculateCondition(conditionFunc());
      conditionVar.set(_not ? !cond : cond);
    }, this.parentView, 'condition');
  });
  return view;
};

/**
 * @summary An inverted [`Blaze.If`](#Blaze-If).
 * @locus Client
 * @param {Function} conditionFunc A function to reactively re-run.  If the result is falsy, `contentFunc` is shown, otherwise `elseFunc` is shown.  An empty array is considered falsy.
 * @param {Function} contentFunc A Function that returns [*renderable content*](#Renderable-Content).
 * @param {Function} [elseFunc] Optional.  A Function that returns [*renderable content*](#Renderable-Content).  If no `elseFunc` is supplied, no content is shown in the "else" case.
 */
Blaze.Unless = function (conditionFunc, contentFunc, elseFunc) {
  return Blaze.If(conditionFunc, contentFunc, elseFunc, true /*_not*/);
};

/**
 * @summary Constructs a View that renders `contentFunc` for each item in a sequence.
 * @locus Client
 * @param {Function} argFunc A function to reactively re-run. The function can
 * return one of two options:
 *
 * 1. An object with two fields: '_variable' and '_sequence'. Each iterates over
 *   '_sequence', it may be a Cursor, an array, null, or undefined. Inside the
 *   Each body you will be able to get the current item from the sequence using
 *   the name specified in the '_variable' field.
 *
 * 2. Just a sequence (Cursor, array, null, or undefined) not wrapped into an
 *   object. Inside the Each body, the current item will be set as the data
 *   context.
 * @param {Function} contentFunc A Function that returns  [*renderable
 * content*](#Renderable-Content).
 * @param {Function} [elseFunc] A Function that returns [*renderable
 * content*](#Renderable-Content) to display in the case when there are no items
 * in the sequence.
 */
Blaze.Each = function (argFunc, contentFunc, elseFunc) {
  var eachView = Blaze.View('each', function () {
    var subviews = this.initialSubviews;
    this.initialSubviews = null;
    if (this._isCreatedForExpansion) {
      this.expandedValueDep = new Tracker.Dependency();
      this.expandedValueDep.depend();
    }
    return subviews;
  });
  eachView.initialSubviews = [];
  eachView.numItems = 0;
  eachView.inElseMode = false;
  eachView.stopHandle = null;
  eachView.contentFunc = contentFunc;
  eachView.elseFunc = elseFunc;
  eachView.argVar = new ReactiveVar();
  eachView.variableName = null;

  // update the @index value in the scope of all subviews in the range
  var updateIndices = function (from, to) {
    if (to === undefined) {
      to = eachView.numItems - 1;
    }
    for (var i = from; i <= to; i++) {
      var view = eachView._domrange.members[i].view;
      view._scopeBindings['@index'].set(i);
    }
  };
  eachView.onViewCreated(function () {
    // We evaluate argFunc in an autorun to make sure
    // Blaze.currentView is always set when it runs (rather than
    // passing argFunc straight to ObserveSequence).
    eachView.autorun(function () {
      // argFunc can return either a sequence as is or a wrapper object with a
      // _sequence and _variable fields set.
      var arg = argFunc();
      if (isObject(arg) && has(arg, '_sequence')) {
        eachView.variableName = arg._variable || null;
        arg = arg._sequence;
      }
      eachView.argVar.set(arg);
    }, eachView.parentView, 'collection');
    eachView.stopHandle = ObserveSequence.observe(function () {
      return eachView.argVar.get();
    }, {
      addedAt: function (id, item, index) {
        Tracker.nonreactive(function () {
          var newItemView;
          if (eachView.variableName) {
            // new-style #each (as in {{#each item in items}})
            // doesn't create a new data context
            newItemView = Blaze.View('item', eachView.contentFunc);
          } else {
            newItemView = Blaze.With(item, eachView.contentFunc);
          }
          eachView.numItems++;
          var bindings = {};
          bindings['@index'] = index;
          if (eachView.variableName) {
            bindings[eachView.variableName] = item;
          }
          Blaze._attachBindingsToView(bindings, newItemView);
          if (eachView.expandedValueDep) {
            eachView.expandedValueDep.changed();
          } else if (eachView._domrange) {
            if (eachView.inElseMode) {
              eachView._domrange.removeMember(0);
              eachView.inElseMode = false;
            }
            var range = Blaze._materializeView(newItemView, eachView);
            eachView._domrange.addMember(range, index);
            updateIndices(index);
          } else {
            eachView.initialSubviews.splice(index, 0, newItemView);
          }
        });
      },
      removedAt: function (id, item, index) {
        Tracker.nonreactive(function () {
          eachView.numItems--;
          if (eachView.expandedValueDep) {
            eachView.expandedValueDep.changed();
          } else if (eachView._domrange) {
            eachView._domrange.removeMember(index);
            updateIndices(index);
            if (eachView.elseFunc && eachView.numItems === 0) {
              eachView.inElseMode = true;
              eachView._domrange.addMember(Blaze._materializeView(Blaze.View('each_else', eachView.elseFunc), eachView), 0);
            }
          } else {
            eachView.initialSubviews.splice(index, 1);
          }
        });
      },
      changedAt: function (id, newItem, oldItem, index) {
        Tracker.nonreactive(function () {
          if (eachView.expandedValueDep) {
            eachView.expandedValueDep.changed();
          } else {
            var itemView;
            if (eachView._domrange) {
              itemView = eachView._domrange.getMember(index).view;
            } else {
              itemView = eachView.initialSubviews[index];
            }
            if (eachView.variableName) {
              itemView._scopeBindings[eachView.variableName].set(newItem);
            } else {
              itemView.dataVar.set(newItem);
            }
          }
        });
      },
      movedTo: function (id, item, fromIndex, toIndex) {
        Tracker.nonreactive(function () {
          if (eachView.expandedValueDep) {
            eachView.expandedValueDep.changed();
          } else if (eachView._domrange) {
            eachView._domrange.moveMember(fromIndex, toIndex);
            updateIndices(Math.min(fromIndex, toIndex), Math.max(fromIndex, toIndex));
          } else {
            var subviews = eachView.initialSubviews;
            var itemView = subviews[fromIndex];
            subviews.splice(fromIndex, 1);
            subviews.splice(toIndex, 0, itemView);
          }
        });
      }
    });
    if (eachView.elseFunc && eachView.numItems === 0) {
      eachView.inElseMode = true;
      eachView.initialSubviews[0] = Blaze.View('each_else', eachView.elseFunc);
    }
  });
  eachView.onViewDestroyed(function () {
    if (eachView.stopHandle) eachView.stopHandle.stop();
  });
  return eachView;
};
Blaze._TemplateWith = function (arg, contentFunc) {
  var w;
  var argFunc = arg;
  if (typeof arg !== 'function') {
    argFunc = function () {
      return arg;
    };
  }

  // This is a little messy.  When we compile `{{> Template.contentBlock}}`, we
  // wrap it in Blaze._InOuterTemplateScope in order to skip the intermediate
  // parent Views in the current template.  However, when there's an argument
  // (`{{> Template.contentBlock arg}}`), the argument needs to be evaluated
  // in the original scope.  There's no good order to nest
  // Blaze._InOuterTemplateScope and Blaze._TemplateWith to achieve this,
  // so we wrap argFunc to run it in the "original parentView" of the
  // Blaze._InOuterTemplateScope.
  //
  // To make this better, reconsider _InOuterTemplateScope as a primitive.
  // Longer term, evaluate expressions in the proper lexical scope.
  var wrappedArgFunc = function () {
    var viewToEvaluateArg = null;
    if (w.parentView && w.parentView.name === 'InOuterTemplateScope') {
      viewToEvaluateArg = w.parentView.originalParentView;
    }
    if (viewToEvaluateArg) {
      return Blaze._withCurrentView(viewToEvaluateArg, argFunc);
    } else {
      return argFunc();
    }
  };
  var wrappedContentFunc = function () {
    var content = contentFunc.call(this);

    // Since we are generating the Blaze._TemplateWith view for the
    // user, set the flag on the child view.  If `content` is a template,
    // construct the View so that we can set the flag.
    if (content instanceof Blaze.Template) {
      content = content.constructView();
    }
    if (content instanceof Blaze.View) {
      content._hasGeneratedParent = true;
    }
    return content;
  };
  w = Blaze.With(wrappedArgFunc, wrappedContentFunc);
  w.__isTemplateWith = true;
  return w;
};
Blaze._InOuterTemplateScope = function (templateView, contentFunc) {
  var view = Blaze.View('InOuterTemplateScope', contentFunc);
  var parentView = templateView.parentView;

  // Hack so that if you call `{{> foo bar}}` and it expands into
  // `{{#with bar}}{{> foo}}{{/with}}`, and then `foo` is a template
  // that inserts `{{> Template.contentBlock}}`, the data context for
  // `Template.contentBlock` is not `bar` but the one enclosing that.
  if (parentView.__isTemplateWith) parentView = parentView.parentView;
  view.onViewCreated(function () {
    this.originalParentView = this.parentView;
    this.parentView = parentView;
    this.__childDoesntStartNewLexicalScope = true;
  });
  return view;
};
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"lookup.js":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/blaze/lookup.js                                                                                            //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
let has;
module.link("lodash.has", {
  default(v) {
    has = v;
  }
}, 0);
Blaze._globalHelpers = {};

// Documented as Template.registerHelper.
// This definition also provides back-compat for `UI.registerHelper`.
Blaze.registerHelper = function (name, func) {
  Blaze._globalHelpers[name] = func;
};

// Also documented as Template.deregisterHelper
Blaze.deregisterHelper = function (name) {
  delete Blaze._globalHelpers[name];
};
var bindIfIsFunction = function (x, target) {
  if (typeof x !== 'function') return x;
  return Blaze._bind(x, target);
};

// If `x` is a function, binds the value of `this` for that function
// to the current data context.
var bindDataContext = function (x) {
  if (typeof x === 'function') {
    return function () {
      var data = Blaze.getData();
      if (data == null) data = {};
      return x.apply(data, arguments);
    };
  }
  return x;
};
Blaze._OLDSTYLE_HELPER = {};
Blaze._getTemplateHelper = function (template, name, tmplInstanceFunc) {
  // XXX COMPAT WITH 0.9.3
  var isKnownOldStyleHelper = false;
  if (template.__helpers.has(name)) {
    var helper = template.__helpers.get(name);
    if (helper === Blaze._OLDSTYLE_HELPER) {
      isKnownOldStyleHelper = true;
    } else if (helper != null) {
      return wrapHelper(bindDataContext(helper), tmplInstanceFunc);
    } else {
      return null;
    }
  }

  // old-style helper
  if (name in template) {
    // Only warn once per helper
    if (!isKnownOldStyleHelper) {
      template.__helpers.set(name, Blaze._OLDSTYLE_HELPER);
      if (!template._NOWARN_OLDSTYLE_HELPERS) {
        Blaze._warn('Assigning helper with `' + template.viewName + '.' + name + ' = ...` is deprecated.  Use `' + template.viewName + '.helpers(...)` instead.');
      }
    }
    if (template[name] != null) {
      return wrapHelper(bindDataContext(template[name]), tmplInstanceFunc);
    }
  }
  return null;
};
var wrapHelper = function (f, templateFunc) {
  if (typeof f !== "function") {
    return f;
  }
  return function () {
    var self = this;
    var args = arguments;
    return Blaze.Template._withTemplateInstanceFunc(templateFunc, function () {
      return Blaze._wrapCatchingExceptions(f, 'template helper').apply(self, args);
    });
  };
};
function _lexicalKeepGoing(currentView) {
  if (!currentView.parentView) {
    return undefined;
  }
  if (!currentView.__startsNewLexicalScope) {
    return currentView.parentView;
  }
  if (currentView.parentView.__childDoesntStartNewLexicalScope) {
    return currentView.parentView;
  }

  // in the case of {{> Template.contentBlock data}} the contentBlock loses the lexical scope of it's parent, wheras {{> Template.contentBlock}} it does not
  // this is because a #with sits between the include InOuterTemplateScope
  if (currentView.parentView.name === "with" && currentView.parentView.parentView && currentView.parentView.parentView.__childDoesntStartNewLexicalScope) {
    return currentView.parentView;
  }
  return undefined;
}
Blaze._lexicalBindingLookup = function (view, name) {
  var currentView = view;
  var blockHelpersStack = [];

  // walk up the views stopping at a Spacebars.include or Template view that
  // doesn't have an InOuterTemplateScope view as a parent
  do {
    // skip block helpers views
    // if we found the binding on the scope, return it
    if (has(currentView._scopeBindings, name)) {
      var bindingReactiveVar = currentView._scopeBindings[name];
      return function () {
        return bindingReactiveVar.get();
      };
    }
  } while (currentView = _lexicalKeepGoing(currentView));
  return null;
};

// templateInstance argument is provided to be available for possible
// alternative implementations of this function by 3rd party packages.
Blaze._getTemplate = function (name, templateInstance) {
  if (name in Blaze.Template && Blaze.Template[name] instanceof Blaze.Template) {
    return Blaze.Template[name];
  }
  return null;
};
Blaze._getGlobalHelper = function (name, templateInstance) {
  if (Blaze._globalHelpers[name] != null) {
    return wrapHelper(bindDataContext(Blaze._globalHelpers[name]), templateInstance);
  }
  return null;
};

// Looks up a name, like "foo" or "..", as a helper of the
// current template; the name of a template; a global helper;
// or a property of the data context.  Called on the View of
// a template (i.e. a View with a `.template` property,
// where the helpers are).  Used for the first name in a
// "path" in a template tag, like "foo" in `{{foo.bar}}` or
// ".." in `{{frobulate ../blah}}`.
//
// Returns a function, a non-function value, or null.  If
// a function is found, it is bound appropriately.
//
// NOTE: This function must not establish any reactive
// dependencies itself.  If there is any reactivity in the
// value, lookup should return a function.
Blaze.View.prototype.lookup = function (name, _options) {
  var template = this.template;
  var lookupTemplate = _options && _options.template;
  var helper;
  var binding;
  var boundTmplInstance;
  var foundTemplate;
  if (this.templateInstance) {
    boundTmplInstance = Blaze._bind(this.templateInstance, this);
  }

  // 0. looking up the parent data context with the special "../" syntax
  if (/^\./.test(name)) {
    // starts with a dot. must be a series of dots which maps to an
    // ancestor of the appropriate height.
    if (!/^(\.)+$/.test(name)) throw new Error("id starting with dot must be a series of dots");
    return Blaze._parentData(name.length - 1, true /*_functionWrapped*/);
  }

  // 1. look up a helper on the current template
  if (template && (helper = Blaze._getTemplateHelper(template, name, boundTmplInstance)) != null) {
    return helper;
  }

  // 2. look up a binding by traversing the lexical view hierarchy inside the
  // current template
  if (template && (binding = Blaze._lexicalBindingLookup(Blaze.currentView, name)) != null) {
    return binding;
  }

  // 3. look up a template by name
  if (lookupTemplate && (foundTemplate = Blaze._getTemplate(name, boundTmplInstance)) != null) {
    return foundTemplate;
  }

  // 4. look up a global helper
  if ((helper = Blaze._getGlobalHelper(name, boundTmplInstance)) != null) {
    return helper;
  }

  // 5. look up in a data context
  return function () {
    var isCalledAsFunction = arguments.length > 0;
    var data = Blaze.getData();
    var x = data && data[name];
    if (!x) {
      if (lookupTemplate) {
        throw new Error("No such template: " + name);
      } else if (isCalledAsFunction) {
        throw new Error("No such function: " + name);
      } else if (name.charAt(0) === '@' && (x === null || x === undefined)) {
        // Throw an error if the user tries to use a `@directive`
        // that doesn't exist.  We don't implement all directives
        // from Handlebars, so there's a potential for confusion
        // if we fail silently.  On the other hand, we want to
        // throw late in case some app or package wants to provide
        // a missing directive.
        throw new Error("Unsupported directive: " + name);
      }
    }
    if (!data) {
      return null;
    }
    if (typeof x !== 'function') {
      if (isCalledAsFunction) {
        throw new Error("Can't call non-function: " + x);
      }
      return x;
    }
    return x.apply(data, arguments);
  };
};

// Implement Spacebars' {{../..}}.
// @param height {Number} The number of '..'s
Blaze._parentData = function (height, _functionWrapped) {
  // If height is null or undefined, we default to 1, the first parent.
  if (height == null) {
    height = 1;
  }
  var theWith = Blaze.getView('with');
  for (var i = 0; i < height && theWith; i++) {
    theWith = Blaze.getView(theWith, 'with');
  }
  if (!theWith) return null;
  if (_functionWrapped) return function () {
    return theWith.dataVar.get();
  };
  return theWith.dataVar.get();
};
Blaze.View.prototype.lookupTemplate = function (name) {
  return this.lookup(name, {
    template: true
  });
};
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"template.js":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/blaze/template.js                                                                                          //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
let isObject;
module.link("lodash.isobject", {
  default(v) {
    isObject = v;
  }
}, 0);
let isFunction;
module.link("lodash.isfunction", {
  default(v) {
    isFunction = v;
  }
}, 1);
let has;
module.link("lodash.has", {
  default(v) {
    has = v;
  }
}, 2);
let isEmpty;
module.link("lodash.isempty", {
  default(v) {
    isEmpty = v;
  }
}, 3);
// [new] Blaze.Template([viewName], renderFunction)
//
// `Blaze.Template` is the class of templates, like `Template.foo` in
// Meteor, which is `instanceof Template`.
//
// `viewKind` is a string that looks like "Template.foo" for templates
// defined by the compiler.

/**
 * @class
 * @summary Constructor for a Template, which is used to construct Views with particular name and content.
 * @locus Client
 * @param {String} [viewName] Optional.  A name for Views constructed by this Template.  See [`view.name`](#view_name).
 * @param {Function} renderFunction A function that returns [*renderable content*](#Renderable-Content).  This function is used as the `renderFunction` for Views constructed by this Template.
 */
Blaze.Template = function (viewName, renderFunction) {
  if (!(this instanceof Blaze.Template))
    // called without `new`
    return new Blaze.Template(viewName, renderFunction);
  if (typeof viewName === 'function') {
    // omitted "viewName" argument
    renderFunction = viewName;
    viewName = '';
  }
  if (typeof viewName !== 'string') throw new Error("viewName must be a String (or omitted)");
  if (typeof renderFunction !== 'function') throw new Error("renderFunction must be a function");
  this.viewName = viewName;
  this.renderFunction = renderFunction;
  this.__helpers = new HelperMap();
  this.__eventMaps = [];
  this._callbacks = {
    created: [],
    rendered: [],
    destroyed: []
  };
};
var Template = Blaze.Template;
var HelperMap = function () {};
HelperMap.prototype.get = function (name) {
  return this[' ' + name];
};
HelperMap.prototype.set = function (name, helper) {
  this[' ' + name] = helper;
};
HelperMap.prototype.has = function (name) {
  return typeof this[' ' + name] !== 'undefined';
};

/**
 * @summary Returns true if `value` is a template object like `Template.myTemplate`.
 * @locus Client
 * @param {Any} value The value to test.
 */
Blaze.isTemplate = function (t) {
  return t instanceof Blaze.Template;
};

/**
 * @name  onCreated
 * @instance
 * @memberOf Template
 * @summary Register a function to be called when an instance of this template is created.
 * @param {Function} callback A function to be added as a callback.
 * @locus Client
 * @importFromPackage templating
 */
Template.prototype.onCreated = function (cb) {
  this._callbacks.created.push(cb);
};

/**
 * @name  onRendered
 * @instance
 * @memberOf Template
 * @summary Register a function to be called when an instance of this template is inserted into the DOM.
 * @param {Function} callback A function to be added as a callback.
 * @locus Client
 * @importFromPackage templating
 */
Template.prototype.onRendered = function (cb) {
  this._callbacks.rendered.push(cb);
};

/**
 * @name  onDestroyed
 * @instance
 * @memberOf Template
 * @summary Register a function to be called when an instance of this template is removed from the DOM and destroyed.
 * @param {Function} callback A function to be added as a callback.
 * @locus Client
 * @importFromPackage templating
 */
Template.prototype.onDestroyed = function (cb) {
  this._callbacks.destroyed.push(cb);
};
Template.prototype._getCallbacks = function (which) {
  var self = this;
  var callbacks = self[which] ? [self[which]] : [];
  // Fire all callbacks added with the new API (Template.onRendered())
  // as well as the old-style callback (e.g. Template.rendered) for
  // backwards-compatibility.
  callbacks = callbacks.concat(self._callbacks[which]);
  return callbacks;
};
var fireCallbacks = function (callbacks, template) {
  Template._withTemplateInstanceFunc(function () {
    return template;
  }, function () {
    for (var i = 0, N = callbacks.length; i < N; i++) {
      callbacks[i].call(template);
    }
  });
};
Template.prototype.constructView = function (contentFunc, elseFunc) {
  var self = this;
  var view = Blaze.View(self.viewName, self.renderFunction);
  view.template = self;
  view.templateContentBlock = contentFunc ? new Template('(contentBlock)', contentFunc) : null;
  view.templateElseBlock = elseFunc ? new Template('(elseBlock)', elseFunc) : null;
  if (self.__eventMaps || typeof self.events === 'object') {
    view._onViewRendered(function () {
      if (view.renderCount !== 1) return;
      if (!self.__eventMaps.length && typeof self.events === "object") {
        // Provide limited back-compat support for `.events = {...}`
        // syntax.  Pass `template.events` to the original `.events(...)`
        // function.  This code must run only once per template, in
        // order to not bind the handlers more than once, which is
        // ensured by the fact that we only do this when `__eventMaps`
        // is falsy, and we cause it to be set now.
        Template.prototype.events.call(self, self.events);
      }
      self.__eventMaps.forEach(function (m) {
        Blaze._addEventMap(view, m, view);
      });
    });
  }
  view._templateInstance = new Blaze.TemplateInstance(view);
  view.templateInstance = function () {
    // Update data, firstNode, and lastNode, and return the TemplateInstance
    // object.
    var inst = view._templateInstance;

    /**
     * @instance
     * @memberOf Blaze.TemplateInstance
     * @name  data
     * @summary The data context of this instance's latest invocation.
     * @locus Client
     */
    inst.data = Blaze.getData(view);
    if (view._domrange && !view.isDestroyed) {
      inst.firstNode = view._domrange.firstNode();
      inst.lastNode = view._domrange.lastNode();
    } else {
      // on 'created' or 'destroyed' callbacks we don't have a DomRange
      inst.firstNode = null;
      inst.lastNode = null;
    }
    return inst;
  };

  /**
   * @name  created
   * @instance
   * @memberOf Template
   * @summary Provide a callback when an instance of a template is created.
   * @locus Client
   * @deprecated in 1.1
   */
  // To avoid situations when new callbacks are added in between view
  // instantiation and event being fired, decide on all callbacks to fire
  // immediately and then fire them on the event.
  var createdCallbacks = self._getCallbacks('created');
  view.onViewCreated(function () {
    fireCallbacks(createdCallbacks, view.templateInstance());
  });

  /**
   * @name  rendered
   * @instance
   * @memberOf Template
   * @summary Provide a callback when an instance of a template is rendered.
   * @locus Client
   * @deprecated in 1.1
   */
  var renderedCallbacks = self._getCallbacks('rendered');
  view.onViewReady(function () {
    fireCallbacks(renderedCallbacks, view.templateInstance());
  });

  /**
   * @name  destroyed
   * @instance
   * @memberOf Template
   * @summary Provide a callback when an instance of a template is destroyed.
   * @locus Client
   * @deprecated in 1.1
   */
  var destroyedCallbacks = self._getCallbacks('destroyed');
  view.onViewDestroyed(function () {
    fireCallbacks(destroyedCallbacks, view.templateInstance());
  });
  return view;
};

/**
 * @class
 * @summary The class for template instances
 * @param {Blaze.View} view
 * @instanceName template
 */
Blaze.TemplateInstance = function (view) {
  if (!(this instanceof Blaze.TemplateInstance))
    // called without `new`
    return new Blaze.TemplateInstance(view);
  if (!(view instanceof Blaze.View)) throw new Error("View required");
  view._templateInstance = this;

  /**
   * @name view
   * @memberOf Blaze.TemplateInstance
   * @instance
   * @summary The [View](../api/blaze.html#Blaze-View) object for this invocation of the template.
   * @locus Client
   * @type {Blaze.View}
   */
  this.view = view;
  this.data = null;

  /**
   * @name firstNode
   * @memberOf Blaze.TemplateInstance
   * @instance
   * @summary The first top-level DOM node in this template instance.
   * @locus Client
   * @type {DOMNode}
   */
  this.firstNode = null;

  /**
   * @name lastNode
   * @memberOf Blaze.TemplateInstance
   * @instance
   * @summary The last top-level DOM node in this template instance.
   * @locus Client
   * @type {DOMNode}
   */
  this.lastNode = null;

  // This dependency is used to identify state transitions in
  // _subscriptionHandles which could cause the result of
  // TemplateInstance#subscriptionsReady to change. Basically this is triggered
  // whenever a new subscription handle is added or when a subscription handle
  // is removed and they are not ready.
  this._allSubsReadyDep = new Tracker.Dependency();
  this._allSubsReady = false;
  this._subscriptionHandles = {};
};

/**
 * @summary Find all elements matching `selector` in this template instance, and return them as a JQuery object.
 * @locus Client
 * @param {String} selector The CSS selector to match, scoped to the template contents.
 * @returns {DOMNode[]}
 */
Blaze.TemplateInstance.prototype.$ = function (selector) {
  var view = this.view;
  if (!view._domrange) throw new Error("Can't use $ on template instance with no DOM");
  return view._domrange.$(selector);
};

/**
 * @summary Find all elements matching `selector` in this template instance.
 * @locus Client
 * @param {String} selector The CSS selector to match, scoped to the template contents.
 * @returns {DOMElement[]}
 */
Blaze.TemplateInstance.prototype.findAll = function (selector) {
  return Array.prototype.slice.call(this.$(selector));
};

/**
 * @summary Find one element matching `selector` in this template instance.
 * @locus Client
 * @param {String} selector The CSS selector to match, scoped to the template contents.
 * @returns {DOMElement}
 */
Blaze.TemplateInstance.prototype.find = function (selector) {
  var result = this.$(selector);
  return result[0] || null;
};

/**
 * @summary A version of [Tracker.autorun](https://docs.meteor.com/api/tracker.html#Tracker-autorun) that is stopped when the template is destroyed.
 * @locus Client
 * @param {Function} runFunc The function to run. It receives one argument: a Tracker.Computation object.
 */
Blaze.TemplateInstance.prototype.autorun = function (f) {
  return this.view.autorun(f);
};

/**
 * @summary A version of [Meteor.subscribe](https://docs.meteor.com/api/pubsub.html#Meteor-subscribe) that is stopped
 * when the template is destroyed.
 * @return {SubscriptionHandle} The subscription handle to the newly made
 * subscription. Call `handle.stop()` to manually stop the subscription, or
 * `handle.ready()` to find out if this particular subscription has loaded all
 * of its inital data.
 * @locus Client
 * @param {String} name Name of the subscription.  Matches the name of the
 * server's `publish()` call.
 * @param {Any} [arg1,arg2...] Optional arguments passed to publisher function
 * on server.
 * @param {Function|Object} [options] If a function is passed instead of an
 * object, it is interpreted as an `onReady` callback.
 * @param {Function} [options.onReady] Passed to [`Meteor.subscribe`](https://docs.meteor.com/api/pubsub.html#Meteor-subscribe).
 * @param {Function} [options.onStop] Passed to [`Meteor.subscribe`](https://docs.meteor.com/api/pubsub.html#Meteor-subscribe).
 * @param {DDP.Connection} [options.connection] The connection on which to make the
 * subscription.
 */
Blaze.TemplateInstance.prototype.subscribe = function () {
  var self = this;
  var subHandles = self._subscriptionHandles;

  // Duplicate logic from Meteor.subscribe
  var options = {};
  for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
    args[_key] = arguments[_key];
  }
  if (args.length) {
    var lastParam = args[args.length - 1];

    // Match pattern to check if the last arg is an options argument
    var lastParamOptionsPattern = {
      onReady: Match.Optional(Function),
      // XXX COMPAT WITH 1.0.3.1 onError used to exist, but now we use
      // onStop with an error callback instead.
      onError: Match.Optional(Function),
      onStop: Match.Optional(Function),
      connection: Match.Optional(Match.Any)
    };
    if (isFunction(lastParam)) {
      options.onReady = args.pop();
    } else if (lastParam && !isEmpty(lastParam) && Match.test(lastParam, lastParamOptionsPattern)) {
      options = args.pop();
    }
  }
  var subHandle;
  var oldStopped = options.onStop;
  options.onStop = function (error) {
    // When the subscription is stopped, remove it from the set of tracked
    // subscriptions to avoid this list growing without bound
    delete subHandles[subHandle.subscriptionId];

    // Removing a subscription can only change the result of subscriptionsReady
    // if we are not ready (that subscription could be the one blocking us being
    // ready).
    if (!self._allSubsReady) {
      self._allSubsReadyDep.changed();
    }
    if (oldStopped) {
      oldStopped(error);
    }
  };
  var connection = options.connection;
  const {
    onReady,
    onError,
    onStop
  } = options;
  var callbacks = {
    onReady,
    onError,
    onStop
  };

  // The callbacks are passed as the last item in the arguments array passed to
  // View#subscribe
  args.push(callbacks);

  // View#subscribe takes the connection as one of the options in the last
  // argument
  subHandle = self.view.subscribe.call(self.view, args, {
    connection: connection
  });
  if (!has(subHandles, subHandle.subscriptionId)) {
    subHandles[subHandle.subscriptionId] = subHandle;

    // Adding a new subscription will always cause us to transition from ready
    // to not ready, but if we are already not ready then this can't make us
    // ready.
    if (self._allSubsReady) {
      self._allSubsReadyDep.changed();
    }
  }
  return subHandle;
};

/**
 * @summary A reactive function that returns true when all of the subscriptions
 * called with [this.subscribe](#TemplateInstance-subscribe) are ready.
 * @return {Boolean} True if all subscriptions on this template instance are
 * ready.
 */
Blaze.TemplateInstance.prototype.subscriptionsReady = function () {
  this._allSubsReadyDep.depend();
  this._allSubsReady = Object.values(this._subscriptionHandles).every(handle => {
    return handle.ready();
  });
  return this._allSubsReady;
};

/**
 * @summary Specify template helpers available to this template.
 * @locus Client
 * @param {Object} helpers Dictionary of helper functions by name.
 * @importFromPackage templating
 */
Template.prototype.helpers = function (dict) {
  if (!isObject(dict)) {
    throw new Error("Helpers dictionary has to be an object");
  }
  for (var k in dict) this.__helpers.set(k, dict[k]);
};
var canUseGetters = function () {
  if (Object.defineProperty) {
    var obj = {};
    try {
      Object.defineProperty(obj, "self", {
        get: function () {
          return obj;
        }
      });
    } catch (e) {
      return false;
    }
    return obj.self === obj;
  }
  return false;
}();
if (canUseGetters) {
  // Like Blaze.currentView but for the template instance. A function
  // rather than a value so that not all helpers are implicitly dependent
  // on the current template instance's `data` property, which would make
  // them dependent on the data context of the template inclusion.
  var currentTemplateInstanceFunc = null;

  // If getters are supported, define this property with a getter function
  // to make it effectively read-only, and to work around this bizarre JSC
  // bug: https://github.com/meteor/meteor/issues/9926
  Object.defineProperty(Template, "_currentTemplateInstanceFunc", {
    get: function () {
      return currentTemplateInstanceFunc;
    }
  });
  Template._withTemplateInstanceFunc = function (templateInstanceFunc, func) {
    if (typeof func !== 'function') {
      throw new Error("Expected function, got: " + func);
    }
    var oldTmplInstanceFunc = currentTemplateInstanceFunc;
    try {
      currentTemplateInstanceFunc = templateInstanceFunc;
      return func();
    } finally {
      currentTemplateInstanceFunc = oldTmplInstanceFunc;
    }
  };
} else {
  // If getters are not supported, just use a normal property.
  Template._currentTemplateInstanceFunc = null;
  Template._withTemplateInstanceFunc = function (templateInstanceFunc, func) {
    if (typeof func !== 'function') {
      throw new Error("Expected function, got: " + func);
    }
    var oldTmplInstanceFunc = Template._currentTemplateInstanceFunc;
    try {
      Template._currentTemplateInstanceFunc = templateInstanceFunc;
      return func();
    } finally {
      Template._currentTemplateInstanceFunc = oldTmplInstanceFunc;
    }
  };
}

/**
 * @summary Specify event handlers for this template.
 * @locus Client
 * @param {EventMap} eventMap Event handlers to associate with this template.
 * @importFromPackage templating
 */
Template.prototype.events = function (eventMap) {
  if (!isObject(eventMap)) {
    throw new Error("Event map has to be an object");
  }
  var template = this;
  var eventMap2 = {};
  for (var k in eventMap) {
    eventMap2[k] = function (k, v) {
      return function (event /*, ...*/) {
        var view = this; // passed by EventAugmenter
        var args = Array.prototype.slice.call(arguments);
        // Exiting the current computation to avoid creating unnecessary
        // and unexpected reactive dependencies with Templates data
        // or any other reactive dependencies defined in event handlers
        return Tracker.nonreactive(function () {
          var data = Blaze.getData(event.currentTarget);
          if (data == null) data = {};
          var tmplInstanceFunc = Blaze._bind(view.templateInstance, view);
          args.splice(1, 0, tmplInstanceFunc());
          return Template._withTemplateInstanceFunc(tmplInstanceFunc, function () {
            return v.apply(data, args);
          });
        });
      };
    }(k, eventMap[k]);
  }
  template.__eventMaps.push(eventMap2);
};

/**
 * @function
 * @name instance
 * @memberOf Template
 * @summary The [template instance](#Template-instances) corresponding to the current template helper, event handler, callback, or autorun.  If there isn't one, `null`.
 * @locus Client
 * @returns {Blaze.TemplateInstance}
 * @importFromPackage templating
 */
Template.instance = function () {
  return Template._currentTemplateInstanceFunc && Template._currentTemplateInstanceFunc();
};

// Note: Template.currentData() is documented to take zero arguments,
// while Blaze.getData takes up to one.

/**
 * @summary
 *
 * - Inside an `onCreated`, `onRendered`, or `onDestroyed` callback, returns
 * the data context of the template.
 * - Inside an event handler, returns the data context of the template on which
 * this event handler was defined.
 * - Inside a helper, returns the data context of the DOM node where the helper
 * was used.
 *
 * Establishes a reactive dependency on the result.
 * @locus Client
 * @function
 * @importFromPackage templating
 */
Template.currentData = Blaze.getData;

/**
 * @summary Accesses other data contexts that enclose the current data context.
 * @locus Client
 * @function
 * @param {Integer} [numLevels] The number of levels beyond the current data context to look. Defaults to 1.
 * @importFromPackage templating
 */
Template.parentData = Blaze._parentData;

/**
 * @summary Defines a [helper function](#Template-helpers) which can be used from all templates.
 * @locus Client
 * @function
 * @param {String} name The name of the helper function you are defining.
 * @param {Function} function The helper function itself.
 * @importFromPackage templating
 */
Template.registerHelper = Blaze.registerHelper;

/**
 * @summary Removes a global [helper function](#Template-helpers).
 * @locus Client
 * @function
 * @param {String} name The name of the helper function you are defining.
 * @importFromPackage templating
 */
Template.deregisterHelper = Blaze.deregisterHelper;
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"backcompat.js":function module(){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/blaze/backcompat.js                                                                                        //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
UI = Blaze;
Blaze.ReactiveVar = ReactiveVar;
UI._templateInstance = Blaze.Template.instance;
Handlebars = {};
Handlebars.registerHelper = Blaze.registerHelper;
Handlebars._escape = Blaze._escape;

// Return these from {{...}} helpers to achieve the same as returning
// strings from {{{...}}} helpers
Handlebars.SafeString = function (string) {
  this.string = string;
};
Handlebars.SafeString.prototype.toString = function () {
  return this.string.toString();
};
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"node_modules":{"lodash.has":{"package.json":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// node_modules/meteor/blaze/node_modules/lodash.has/package.json                                                      //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
module.exports = {
  "name": "lodash.has",
  "version": "4.5.2"
};

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"index.js":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// node_modules/meteor/blaze/node_modules/lodash.has/index.js                                                          //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
module.useNode();
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}},"lodash.isobject":{"package.json":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// node_modules/meteor/blaze/node_modules/lodash.isobject/package.json                                                 //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
module.exports = {
  "name": "lodash.isobject",
  "version": "3.0.2"
};

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"index.js":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// node_modules/meteor/blaze/node_modules/lodash.isobject/index.js                                                     //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
module.useNode();
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}},"lodash.isfunction":{"package.json":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// node_modules/meteor/blaze/node_modules/lodash.isfunction/package.json                                               //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
module.exports = {
  "name": "lodash.isfunction",
  "version": "3.0.9"
};

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"index.js":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// node_modules/meteor/blaze/node_modules/lodash.isfunction/index.js                                                   //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
module.useNode();
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}},"lodash.isempty":{"package.json":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// node_modules/meteor/blaze/node_modules/lodash.isempty/package.json                                                  //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
module.exports = {
  "name": "lodash.isempty",
  "version": "4.4.0"
};

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"index.js":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// node_modules/meteor/blaze/node_modules/lodash.isempty/index.js                                                      //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
module.useNode();
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}}}}}}},{
  "extensions": [
    ".js",
    ".json"
  ]
});

require("/node_modules/meteor/blaze/preamble.js");
require("/node_modules/meteor/blaze/exceptions.js");
require("/node_modules/meteor/blaze/view.js");
require("/node_modules/meteor/blaze/builtins.js");
require("/node_modules/meteor/blaze/lookup.js");
require("/node_modules/meteor/blaze/template.js");
require("/node_modules/meteor/blaze/backcompat.js");

/* Exports */
Package._define("blaze", {
  Blaze: Blaze,
  UI: UI,
  Handlebars: Handlebars
});

})();

//# sourceURL=meteor://💻app/packages/blaze.js
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm1ldGVvcjovL/CfkrthcHAvcGFja2FnZXMvYmxhemUvcHJlYW1ibGUuanMiLCJtZXRlb3I6Ly/wn5K7YXBwL3BhY2thZ2VzL2JsYXplL2V4Y2VwdGlvbnMuanMiLCJtZXRlb3I6Ly/wn5K7YXBwL3BhY2thZ2VzL2JsYXplL3ZpZXcuanMiLCJtZXRlb3I6Ly/wn5K7YXBwL3BhY2thZ2VzL2JsYXplL2J1aWx0aW5zLmpzIiwibWV0ZW9yOi8v8J+Su2FwcC9wYWNrYWdlcy9ibGF6ZS9sb29rdXAuanMiLCJtZXRlb3I6Ly/wn5K7YXBwL3BhY2thZ2VzL2JsYXplL3RlbXBsYXRlLmpzIiwibWV0ZW9yOi8v8J+Su2FwcC9wYWNrYWdlcy9ibGF6ZS9iYWNrY29tcGF0LmpzIl0sIm5hbWVzIjpbIkJsYXplIiwiX2VzY2FwZSIsImVzY2FwZV9tYXAiLCJlc2NhcGVfb25lIiwiYyIsIngiLCJyZXBsYWNlIiwiX3dhcm4iLCJtc2ciLCJjb25zb2xlIiwid2FybiIsIm5hdGl2ZUJpbmQiLCJGdW5jdGlvbiIsInByb3RvdHlwZSIsImJpbmQiLCJfYmluZCIsImZ1bmMiLCJvYmoiLCJhcmd1bWVudHMiLCJsZW5ndGgiLCJjYWxsIiwiYXJncyIsIkFycmF5IiwiaSIsImFwcGx5Iiwic2xpY2UiLCJvYmpBIiwib2JqQiIsImRlYnVnRnVuYyIsIl90aHJvd05leHRFeGNlcHRpb24iLCJfcmVwb3J0RXhjZXB0aW9uIiwiZSIsIk1ldGVvciIsIl9kZWJ1ZyIsImxvZyIsInN0YWNrIiwibWVzc2FnZSIsIl93cmFwQ2F0Y2hpbmdFeGNlcHRpb25zIiwiZiIsIndoZXJlIiwiVmlldyIsIm5hbWUiLCJyZW5kZXIiLCJfcmVuZGVyIiwiX2NhbGxiYWNrcyIsImNyZWF0ZWQiLCJyZW5kZXJlZCIsImRlc3Ryb3llZCIsImlzQ3JlYXRlZCIsIl9pc0NyZWF0ZWRGb3JFeHBhbnNpb24iLCJpc1JlbmRlcmVkIiwiX2lzQXR0YWNoZWQiLCJpc0Rlc3Ryb3llZCIsIl9pc0luUmVuZGVyIiwicGFyZW50VmlldyIsIl9kb21yYW5nZSIsIl9oYXNHZW5lcmF0ZWRQYXJlbnQiLCJfc2NvcGVCaW5kaW5ncyIsInJlbmRlckNvdW50Iiwib25WaWV3Q3JlYXRlZCIsImNiIiwicHVzaCIsIl9vblZpZXdSZW5kZXJlZCIsIm9uVmlld1JlYWR5Iiwic2VsZiIsImZpcmUiLCJUcmFja2VyIiwiYWZ0ZXJGbHVzaCIsIl93aXRoQ3VycmVudFZpZXciLCJvblZpZXdSZW5kZXJlZCIsImF0dGFjaGVkIiwib25BdHRhY2hlZCIsIm9uVmlld0Rlc3Ryb3llZCIsInJlbW92ZVZpZXdEZXN0cm95ZWRMaXN0ZW5lciIsImluZGV4IiwibGFzdEluZGV4T2YiLCJhdXRvcnVuIiwiX2luVmlld1Njb3BlIiwiZGlzcGxheU5hbWUiLCJFcnJvciIsInRlbXBsYXRlSW5zdGFuY2VGdW5jIiwiVGVtcGxhdGUiLCJfY3VycmVudFRlbXBsYXRlSW5zdGFuY2VGdW5jIiwidmlld0F1dG9ydW4iLCJfd2l0aFRlbXBsYXRlSW5zdGFuY2VGdW5jIiwiY29tcCIsInN0b3BDb21wdXRhdGlvbiIsInN0b3AiLCJvblN0b3AiLCJfZXJyb3JJZlNob3VsZG50Q2FsbFN1YnNjcmliZSIsInN1YnNjcmliZSIsIm9wdGlvbnMiLCJzdWJIYW5kbGUiLCJjb25uZWN0aW9uIiwiZmlyc3ROb2RlIiwibGFzdE5vZGUiLCJfZmlyZUNhbGxiYWNrcyIsInZpZXciLCJ3aGljaCIsIm5vbnJlYWN0aXZlIiwiZmlyZUNhbGxiYWNrcyIsImNicyIsIk4iLCJfY3JlYXRlVmlldyIsImZvckV4cGFuc2lvbiIsImRvRmlyc3RSZW5kZXIiLCJpbml0aWFsQ29udGVudCIsImRvbXJhbmdlIiwiX0RPTVJhbmdlIiwidGVhcmRvd25Ib29rIiwicmFuZ2UiLCJlbGVtZW50IiwiX0RPTUJhY2tlbmQiLCJUZWFyZG93biIsIm9uRWxlbWVudFRlYXJkb3duIiwidGVhcmRvd24iLCJfZGVzdHJveVZpZXciLCJfbWF0ZXJpYWxpemVWaWV3IiwiX3dvcmtTdGFjayIsIl9pbnRvQXJyYXkiLCJsYXN0SHRtbGpzIiwiZG9SZW5kZXIiLCJodG1sanMiLCJmaXJzdFJ1biIsIl9pc0NvbnRlbnRFcXVhbCIsImRvTWF0ZXJpYWxpemUiLCJyYW5nZXNBbmROb2RlcyIsIl9tYXRlcmlhbGl6ZURPTSIsInNldE1lbWJlcnMiLCJvbkludmFsaWRhdGUiLCJkZXN0cm95TWVtYmVycyIsInVuZGVmaW5lZCIsImluaXRpYWxDb250ZW50cyIsIl9leHBhbmRWaWV3IiwicmVzdWx0IiwiX2V4cGFuZCIsImFjdGl2ZSIsIl9IVE1MSlNFeHBhbmRlciIsIkhUTUwiLCJUcmFuc2Zvcm1pbmdWaXNpdG9yIiwiZXh0ZW5kIiwiZGVmIiwidmlzaXRPYmplY3QiLCJjb25zdHJ1Y3RWaWV3IiwidmlzaXRBdHRyaWJ1dGVzIiwiYXR0cnMiLCJ2aXNpdEF0dHJpYnV0ZSIsInZhbHVlIiwidGFnIiwiY3VycmVudFZpZXdJZlJlbmRlcmluZyIsImN1cnJlbnRWaWV3IiwidmlzaXQiLCJfZXhwYW5kQXR0cmlidXRlcyIsIl9za2lwTm9kZXMiLCJfZGVzdHJveU5vZGUiLCJub2RlIiwibm9kZVR5cGUiLCJ0ZWFyRG93bkVsZW1lbnQiLCJhIiwiYiIsIlJhdyIsIm9sZFZpZXciLCJjaGVja1JlbmRlckNvbnRlbnQiLCJjb250ZW50IiwiVmlzaXRvciIsImNvbnRlbnRBc1ZpZXciLCJjb250ZW50QXNGdW5jIiwiX19yb290Vmlld3MiLCJwYXJlbnRFbGVtZW50IiwibmV4dE5vZGUiLCJpbmRleE9mIiwic3BsaWNlIiwiYXR0YWNoIiwiaW5zZXJ0IiwicmVuZGVyV2l0aERhdGEiLCJkYXRhIiwiX1RlbXBsYXRlV2l0aCIsInJlbW92ZSIsImRlc3Ryb3kiLCJwYXJlbnRSYW5nZSIsImRldGFjaCIsInRvSFRNTCIsInRvSFRNTFdpdGhEYXRhIiwiX3RvVGV4dCIsInRleHRNb2RlIiwiVEVYVE1PREUiLCJTVFJJTkciLCJSQ0RBVEEiLCJBVFRSSUJVVEUiLCJ0b1RleHQiLCJnZXREYXRhIiwiZWxlbWVudE9yVmlldyIsInRoZVdpdGgiLCJnZXRWaWV3IiwiZGF0YVZhciIsImdldCIsImdldEVsZW1lbnREYXRhIiwiX3ZpZXdOYW1lIiwidmlld05hbWUiLCJfZ2V0Q3VycmVudFZpZXciLCJfZ2V0UGFyZW50VmlldyIsIl9nZXRFbGVtZW50VmlldyIsInYiLCJlbGVtIiwiZm9yRWxlbWVudCIsIl9hZGRFdmVudE1hcCIsImV2ZW50TWFwIiwidGhpc0luSGFuZGxlciIsImhhbmRsZXMiLCJhdHRhY2hlZF9ldmVudE1hcHMiLCJPYmplY3QiLCJrZXlzIiwiZm9yRWFjaCIsInNwZWMiLCJoYW5kbGVyIiwiY2xhdXNlcyIsInNwbGl0IiwiY2xhdXNlIiwicGFydHMiLCJuZXdFdmVudHMiLCJzaGlmdCIsInNlbGVjdG9yIiwiam9pbiIsIl9FdmVudFN1cHBvcnQiLCJsaXN0ZW4iLCJldnQiLCJjb250YWluc0VsZW1lbnQiLCJjdXJyZW50VGFyZ2V0IiwiaGFuZGxlclRoaXMiLCJoYW5kbGVyQXJncyIsInIiLCJoIiwiaGFzIiwibW9kdWxlIiwibGluayIsImRlZmF1bHQiLCJpc09iamVjdCIsIl9jYWxjdWxhdGVDb25kaXRpb24iLCJjb25kIiwiaXNBcnJheSIsIldpdGgiLCJjb250ZW50RnVuYyIsIlJlYWN0aXZlVmFyIiwic2V0IiwiX2F0dGFjaEJpbmRpbmdzVG9WaWV3IiwiYmluZGluZ3MiLCJlbnRyaWVzIiwiYmluZGluZyIsIkxldCIsIklmIiwiY29uZGl0aW9uRnVuYyIsImVsc2VGdW5jIiwiX25vdCIsImNvbmRpdGlvblZhciIsIl9fY29uZGl0aW9uVmFyIiwiVW5sZXNzIiwiRWFjaCIsImFyZ0Z1bmMiLCJlYWNoVmlldyIsInN1YnZpZXdzIiwiaW5pdGlhbFN1YnZpZXdzIiwiZXhwYW5kZWRWYWx1ZURlcCIsIkRlcGVuZGVuY3kiLCJkZXBlbmQiLCJudW1JdGVtcyIsImluRWxzZU1vZGUiLCJzdG9wSGFuZGxlIiwiYXJnVmFyIiwidmFyaWFibGVOYW1lIiwidXBkYXRlSW5kaWNlcyIsImZyb20iLCJ0byIsIm1lbWJlcnMiLCJhcmciLCJfdmFyaWFibGUiLCJfc2VxdWVuY2UiLCJPYnNlcnZlU2VxdWVuY2UiLCJvYnNlcnZlIiwiYWRkZWRBdCIsImlkIiwiaXRlbSIsIm5ld0l0ZW1WaWV3IiwiY2hhbmdlZCIsInJlbW92ZU1lbWJlciIsImFkZE1lbWJlciIsInJlbW92ZWRBdCIsImNoYW5nZWRBdCIsIm5ld0l0ZW0iLCJvbGRJdGVtIiwiaXRlbVZpZXciLCJnZXRNZW1iZXIiLCJtb3ZlZFRvIiwiZnJvbUluZGV4IiwidG9JbmRleCIsIm1vdmVNZW1iZXIiLCJNYXRoIiwibWluIiwibWF4IiwidyIsIndyYXBwZWRBcmdGdW5jIiwidmlld1RvRXZhbHVhdGVBcmciLCJvcmlnaW5hbFBhcmVudFZpZXciLCJ3cmFwcGVkQ29udGVudEZ1bmMiLCJfX2lzVGVtcGxhdGVXaXRoIiwiX0luT3V0ZXJUZW1wbGF0ZVNjb3BlIiwidGVtcGxhdGVWaWV3IiwiX19jaGlsZERvZXNudFN0YXJ0TmV3TGV4aWNhbFNjb3BlIiwiX2dsb2JhbEhlbHBlcnMiLCJyZWdpc3RlckhlbHBlciIsImRlcmVnaXN0ZXJIZWxwZXIiLCJiaW5kSWZJc0Z1bmN0aW9uIiwidGFyZ2V0IiwiYmluZERhdGFDb250ZXh0IiwiX09MRFNUWUxFX0hFTFBFUiIsIl9nZXRUZW1wbGF0ZUhlbHBlciIsInRlbXBsYXRlIiwidG1wbEluc3RhbmNlRnVuYyIsImlzS25vd25PbGRTdHlsZUhlbHBlciIsIl9faGVscGVycyIsImhlbHBlciIsIndyYXBIZWxwZXIiLCJfTk9XQVJOX09MRFNUWUxFX0hFTFBFUlMiLCJ0ZW1wbGF0ZUZ1bmMiLCJfbGV4aWNhbEtlZXBHb2luZyIsIl9fc3RhcnRzTmV3TGV4aWNhbFNjb3BlIiwiX2xleGljYWxCaW5kaW5nTG9va3VwIiwiYmxvY2tIZWxwZXJzU3RhY2siLCJiaW5kaW5nUmVhY3RpdmVWYXIiLCJfZ2V0VGVtcGxhdGUiLCJ0ZW1wbGF0ZUluc3RhbmNlIiwiX2dldEdsb2JhbEhlbHBlciIsImxvb2t1cCIsIl9vcHRpb25zIiwibG9va3VwVGVtcGxhdGUiLCJib3VuZFRtcGxJbnN0YW5jZSIsImZvdW5kVGVtcGxhdGUiLCJ0ZXN0IiwiX3BhcmVudERhdGEiLCJpc0NhbGxlZEFzRnVuY3Rpb24iLCJjaGFyQXQiLCJoZWlnaHQiLCJfZnVuY3Rpb25XcmFwcGVkIiwiaXNGdW5jdGlvbiIsImlzRW1wdHkiLCJyZW5kZXJGdW5jdGlvbiIsIkhlbHBlck1hcCIsIl9fZXZlbnRNYXBzIiwiaXNUZW1wbGF0ZSIsInQiLCJvbkNyZWF0ZWQiLCJvblJlbmRlcmVkIiwib25EZXN0cm95ZWQiLCJfZ2V0Q2FsbGJhY2tzIiwiY2FsbGJhY2tzIiwiY29uY2F0IiwidGVtcGxhdGVDb250ZW50QmxvY2siLCJ0ZW1wbGF0ZUVsc2VCbG9jayIsImV2ZW50cyIsIm0iLCJfdGVtcGxhdGVJbnN0YW5jZSIsIlRlbXBsYXRlSW5zdGFuY2UiLCJpbnN0IiwiY3JlYXRlZENhbGxiYWNrcyIsInJlbmRlcmVkQ2FsbGJhY2tzIiwiZGVzdHJveWVkQ2FsbGJhY2tzIiwiX2FsbFN1YnNSZWFkeURlcCIsIl9hbGxTdWJzUmVhZHkiLCJfc3Vic2NyaXB0aW9uSGFuZGxlcyIsIiQiLCJmaW5kQWxsIiwiZmluZCIsInN1YkhhbmRsZXMiLCJsYXN0UGFyYW0iLCJsYXN0UGFyYW1PcHRpb25zUGF0dGVybiIsIm9uUmVhZHkiLCJNYXRjaCIsIk9wdGlvbmFsIiwib25FcnJvciIsIkFueSIsInBvcCIsIm9sZFN0b3BwZWQiLCJlcnJvciIsInN1YnNjcmlwdGlvbklkIiwic3Vic2NyaXB0aW9uc1JlYWR5IiwidmFsdWVzIiwiZXZlcnkiLCJoYW5kbGUiLCJyZWFkeSIsImhlbHBlcnMiLCJkaWN0IiwiayIsImNhblVzZUdldHRlcnMiLCJkZWZpbmVQcm9wZXJ0eSIsImN1cnJlbnRUZW1wbGF0ZUluc3RhbmNlRnVuYyIsIm9sZFRtcGxJbnN0YW5jZUZ1bmMiLCJldmVudE1hcDIiLCJldmVudCIsImluc3RhbmNlIiwiY3VycmVudERhdGEiLCJwYXJlbnREYXRhIiwiVUkiLCJIYW5kbGViYXJzIiwi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VCxLQUFLLENBQUNvVCxjQUFjO0FBRWhENkYsVUFBVSxDQUFDaFosT0FBTyxHQUFHRCxLQUFLLENBQUNDLE9BQU87O0FBRWxDO0FBQ0E7QUFDQWdaLFVBQVUsQ0FBQ0MsVUFBVSxHQUFHLFVBQVNDLE1BQU0sRUFBRTtFQUN2QyxJQUFJLENBQUNBLE1BQU0sR0FBR0EsTUFBTTtBQUN0QixDQUFDO0FBQ0RGLFVBQVUsQ0FBQ0MsVUFBVSxDQUFDclksU0FBUyxDQUFDdVksUUFBUSxHQUFHLFlBQVc7RUFDcEQsT0FBTyxJQUFJLENBQUNELE1BQU0sQ0FBQ0MsUUFBUSxFQUFFO0FBQy9CLENBQUMsQyIsImZpbGUiOiIvcGFja2FnZXMvYmxhemUuanMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEBuYW1lc3BhY2UgQmxhemVcbiAqIEBzdW1tYXJ5IFRoZSBuYW1lc3BhY2UgZm9yIGFsbCBCbGF6ZS1yZWxhdGVkIG1ldGhvZHMgYW5kIGNsYXNzZXMuXG4gKi9cbkJsYXplID0ge307XG5cbi8vIFV0aWxpdHkgdG8gSFRNTC1lc2NhcGUgYSBzdHJpbmcuICBJbmNsdWRlZCBmb3IgbGVnYWN5IHJlYXNvbnMuXG4vLyBUT0RPOiBTaG91bGQgYmUgcmVwbGFjZWQgd2l0aCBfLmVzY2FwZSBvbmNlIHVuZGVyc2NvcmUgaXMgdXBncmFkZWQgdG8gYSBuZXdlclxuLy8gICAgICAgdmVyc2lvbiB3aGljaCBlc2NhcGVzIGAgKGJhY2t0aWNrKSBhcyB3ZWxsLiBVbmRlcnNjb3JlIDEuNS4yIGRvZXMgbm90LlxuQmxhemUuX2VzY2FwZSA9IChmdW5jdGlvbigpIHtcbiAgdmFyIGVzY2FwZV9tYXAgPSB7XG4gICAgXCI8XCI6IFwiJmx0O1wiLFxuICAgIFwiPlwiOiBcIiZndDtcIixcbiAgICAnXCInOiBcIiZxdW90O1wiLFxuICAgIFwiJ1wiOiBcIiYjeDI3O1wiLFxuICAgIFwiL1wiOiBcIiYjeDJGO1wiLFxuICAgIFwiYFwiOiBcIiYjeDYwO1wiLCAvKiBJRSBhbGxvd3MgYmFja3RpY2stZGVsaW1pdGVkIGF0dHJpYnV0ZXM/PyAqL1xuICAgIFwiJlwiOiBcIiZhbXA7XCJcbiAgfTtcbiAgdmFyIGVzY2FwZV9vbmUgPSBmdW5jdGlvbihjKSB7XG4gICAgcmV0dXJuIGVzY2FwZV9tYXBbY107XG4gIH07XG5cbiAgcmV0dXJuIGZ1bmN0aW9uICh4KSB7XG4gICAgcmV0dXJuIHgucmVwbGFjZSgvWyY8PlwiJ2BdL2csIGVzY2FwZV9vbmUpO1xuICB9O1xufSkoKTtcblxuQmxhemUuX3dhcm4gPSBmdW5jdGlvbiAobXNnKSB7XG4gIG1zZyA9ICdXYXJuaW5nOiAnICsgbXNnO1xuXG4gIGlmICgodHlwZW9mIGNvbnNvbGUgIT09ICd1bmRlZmluZWQnKSAmJiBjb25zb2xlLndhcm4pIHtcbiAgICBjb25zb2xlLndhcm4obXNnKTtcbiAgfVxufTtcblxudmFyIG5hdGl2ZUJpbmQgPSBGdW5jdGlvbi5wcm90b3R5cGUuYmluZDtcblxuLy8gQW4gaW1wbGVtZW50YXRpb24gb2YgXy5iaW5kIHdoaWNoIGFsbG93cyBiZXR0ZXIgb3B0aW1pemF0aW9uLlxuLy8gU2VlOiBodHRwczovL2dpdGh1Yi5jb20vcGV0a2FhbnRvbm92L2JsdWViaXJkL3dpa2kvT3B0aW1pemF0aW9uLWtpbGxlcnMjMy1tYW5hZ2luZy1hcmd1bWVudHNcbmlmIChuYXRpdmVCaW5kKSB7XG4gIEJsYXplLl9iaW5kID0gZnVuY3Rpb24gKGZ1bmMsIG9iaikge1xuICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID09PSAyKSB7XG4gICAgICByZXR1cm4gbmF0aXZlQmluZC5jYWxsKGZ1bmMsIG9iaik7XG4gICAgfVxuXG4gICAgLy8gQ29weSB0aGUgYXJndW1lbnRzIHNvIHRoaXMgZnVuY3Rpb24gY2FuIGJlIG9wdGltaXplZC5cbiAgICB2YXIgYXJncyA9IG5ldyBBcnJheShhcmd1bWVudHMubGVuZ3RoKTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGFyZ3MubGVuZ3RoOyBpKyspIHtcbiAgICAgIGFyZ3NbaV0gPSBhcmd1bWVudHNbaV07XG4gICAgfVxuXG4gICAgcmV0dXJuIG5hdGl2ZUJpbmQuYXBwbHkoZnVuYywgYXJncy5zbGljZSgxKSk7XG4gIH07XG59XG5lbHNlIHtcbiAgLy8gQSBzbG93ZXIgYnV0IGJhY2t3YXJkcyBjb21wYXRpYmxlIHZlcnNpb24uXG4gIEJsYXplLl9iaW5kID0gZnVuY3Rpb24ob2JqQSwgb2JqQikge1xuICAgIG9iakEuYmluZChvYmpCKTtcbiAgfTtcbn1cbiIsInZhciBkZWJ1Z0Z1bmM7XG5cbi8vIFdlIGNhbGwgaW50byB1c2VyIGNvZGUgaW4gbWFueSBwbGFjZXMsIGFuZCBpdCdzIG5pY2UgdG8gY2F0Y2ggZXhjZXB0aW9uc1xuLy8gcHJvcGFnYXRlZCBmcm9tIHVzZXIgY29kZSBpbW1lZGlhdGVseSBzbyB0aGF0IHRoZSB3aG9sZSBzeXN0ZW0gZG9lc24ndCBqdXN0XG4vLyBicmVhay4gIENhdGNoaW5nIGV4Y2VwdGlvbnMgaXMgZWFzeTsgcmVwb3J0aW5nIHRoZW0gaXMgaGFyZC4gIFRoaXMgaGVscGVyXG4vLyByZXBvcnRzIGV4Y2VwdGlvbnMuXG4vL1xuLy8gVXNhZ2U6XG4vL1xuLy8gYGBgXG4vLyB0cnkge1xuLy8gICAvLyAuLi4gc29tZVN0dWZmIC4uLlxuLy8gfSBjYXRjaCAoZSkge1xuLy8gICByZXBvcnRVSUV4Y2VwdGlvbihlKTtcbi8vIH1cbi8vIGBgYFxuLy9cbi8vIEFuIG9wdGlvbmFsIHNlY29uZCBhcmd1bWVudCBvdmVycmlkZXMgdGhlIGRlZmF1bHQgbWVzc2FnZS5cblxuLy8gU2V0IHRoaXMgdG8gYHRydWVgIHRvIGNhdXNlIGByZXBvcnRFeGNlcHRpb25gIHRvIHRocm93XG4vLyB0aGUgbmV4dCBleGNlcHRpb24gcmF0aGVyIHRoYW4gcmVwb3J0aW5nIGl0LiAgVGhpcyBpc1xuLy8gdXNlZnVsIGluIHVuaXQgdGVzdHMgdGhhdCB0ZXN0IGVycm9yIG1lc3NhZ2VzLlxuQmxhemUuX3Rocm93TmV4dEV4Y2VwdGlvbiA9IGZhbHNlO1xuXG5CbGF6ZS5fcmVwb3J0RXhjZXB0aW9uID0gZnVuY3Rpb24gKGUsIG1zZykge1xuICBpZiAoQmxhemUuX3Rocm93TmV4dEV4Y2VwdGlvbikge1xuICAgIEJsYXplLl90aHJvd05leHRFeGNlcHRpb24gPSBmYWxzZTtcbiAgICB0aHJvdyBlO1xuICB9XG5cbiAgaWYgKCEgZGVidWdGdW5jKVxuICAgIC8vIGFkYXB0ZWQgZnJvbSBUcmFja2VyXG4gICAgZGVidWdGdW5jID0gZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuICh0eXBlb2YgTWV0ZW9yICE9PSBcInVuZGVmaW5lZFwiID8gTWV0ZW9yLl9kZWJ1ZyA6XG4gICAgICAgICAgICAgICgodHlwZW9mIGNvbnNvbGUgIT09IFwidW5kZWZpbmVkXCIpICYmIGNvbnNvbGUubG9nID8gY29uc29sZS5sb2cgOlxuICAgICAgICAgICAgICAgZnVuY3Rpb24gKCkge30pKTtcbiAgICB9O1xuXG4gIC8vIEluIENocm9tZSwgYGUuc3RhY2tgIGlzIGEgbXVsdGlsaW5lIHN0cmluZyB0aGF0IHN0YXJ0cyB3aXRoIHRoZSBtZXNzYWdlXG4gIC8vIGFuZCBjb250YWlucyBhIHN0YWNrIHRyYWNlLiAgRnVydGhlcm1vcmUsIGBjb25zb2xlLmxvZ2AgbWFrZXMgaXQgY2xpY2thYmxlLlxuICAvLyBgY29uc29sZS5sb2dgIHN1cHBsaWVzIHRoZSBzcGFjZSBiZXR3ZWVuIHRoZSB0d28gYXJndW1lbnRzLlxuICBkZWJ1Z0Z1bmMoKShtc2cgfHwgJ0V4Y2VwdGlvbiBjYXVnaHQgaW4gdGVtcGxhdGU6JywgZS5zdGFjayB8fCBlLm1lc3NhZ2UgfHwgZSk7XG59O1xuXG5CbGF6ZS5fd3JhcENhdGNoaW5nRXhjZXB0aW9ucyA9IGZ1bmN0aW9uIChmLCB3aGVyZSkge1xuICBpZiAodHlwZW9mIGYgIT09ICdmdW5jdGlvbicpXG4gICAgcmV0dXJuIGY7XG5cbiAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcbiAgICB0cnkge1xuICAgICAgcmV0dXJuIGYuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBCbGF6ZS5fcmVwb3J0RXhjZXB0aW9uKGUsICdFeGNlcHRpb24gaW4gJyArIHdoZXJlICsgJzonKTtcbiAgICB9XG4gIH07XG59O1xuIiwiLy8vIFtuZXddIEJsYXplLlZpZXcoW25hbWVdLCByZW5kZXJNZXRob2QpXG4vLy9cbi8vLyBCbGF6ZS5WaWV3IGlzIHRoZSBidWlsZGluZyBibG9jayBvZiByZWFjdGl2ZSBET00uICBWaWV3cyBoYXZlXG4vLy8gdGhlIGZvbGxvd2luZyBmZWF0dXJlczpcbi8vL1xuLy8vICogbGlmZWN5Y2xlIGNhbGxiYWNrcyAtIFZpZXdzIGFyZSBjcmVhdGVkLCByZW5kZXJlZCwgYW5kIGRlc3Ryb3llZCxcbi8vLyAgIGFuZCBjYWxsYmFja3MgY2FuIGJlIHJlZ2lzdGVyZWQgdG8gZmlyZSB3aGVuIHRoZXNlIHRoaW5ncyBoYXBwZW4uXG4vLy9cbi8vLyAqIHBhcmVudCBwb2ludGVyIC0gQSBWaWV3IHBvaW50cyB0byBpdHMgcGFyZW50Vmlldywgd2hpY2ggaXMgdGhlXG4vLy8gICBWaWV3IHRoYXQgY2F1c2VkIGl0IHRvIGJlIHJlbmRlcmVkLiAgVGhlc2UgcG9pbnRlcnMgZm9ybSBhXG4vLy8gICBoaWVyYXJjaHkgb3IgdHJlZSBvZiBWaWV3cy5cbi8vL1xuLy8vICogcmVuZGVyKCkgbWV0aG9kIC0gQSBWaWV3J3MgcmVuZGVyKCkgbWV0aG9kIHNwZWNpZmllcyB0aGUgRE9NXG4vLy8gICAob3IgSFRNTCkgY29udGVudCBvZiB0aGUgVmlldy4gIElmIHRoZSBtZXRob2QgZXN0YWJsaXNoZXNcbi8vLyAgIHJlYWN0aXZlIGRlcGVuZGVuY2llcywgaXQgbWF5IGJlIHJlLXJ1bi5cbi8vL1xuLy8vICogYSBET01SYW5nZSAtIElmIGEgVmlldyBpcyByZW5kZXJlZCB0byBET00sIGl0cyBwb3NpdGlvbiBhbmRcbi8vLyAgIGV4dGVudCBpbiB0aGUgRE9NIGFyZSB0cmFja2VkIHVzaW5nIGEgRE9NUmFuZ2Ugb2JqZWN0LlxuLy8vXG4vLy8gV2hlbiBhIFZpZXcgaXMgY29uc3RydWN0ZWQgYnkgY2FsbGluZyBCbGF6ZS5WaWV3LCB0aGUgVmlldyBpc1xuLy8vIG5vdCB5ZXQgY29uc2lkZXJlZCBcImNyZWF0ZWQuXCIgIEl0IGRvZXNuJ3QgaGF2ZSBhIHBhcmVudFZpZXcgeWV0LFxuLy8vIGFuZCBubyBsb2dpYyBoYXMgYmVlbiBydW4gdG8gaW5pdGlhbGl6ZSB0aGUgVmlldy4gIEFsbCByZWFsXG4vLy8gd29yayBpcyBkZWZlcnJlZCB1bnRpbCBhdCBsZWFzdCBjcmVhdGlvbiB0aW1lLCB3aGVuIHRoZSBvblZpZXdDcmVhdGVkXG4vLy8gY2FsbGJhY2tzIGFyZSBmaXJlZCwgd2hpY2ggaGFwcGVucyB3aGVuIHRoZSBWaWV3IGlzIFwidXNlZFwiIGluXG4vLy8gc29tZSB3YXkgdGhhdCByZXF1aXJlcyBpdCB0byBiZSByZW5kZXJlZC5cbi8vL1xuLy8vIC4uLm1vcmUgbGlmZWN5Y2xlIHN0dWZmXG4vLy9cbi8vLyBgbmFtZWAgaXMgYW4gb3B0aW9uYWwgc3RyaW5nIHRhZyBpZGVudGlmeWluZyB0aGUgVmlldy4gIFRoZSBvbmx5XG4vLy8gdGltZSBpdCdzIHVzZWQgaXMgd2hlbiBsb29raW5nIGluIHRoZSBWaWV3IHRyZWUgZm9yIGEgVmlldyBvZiBhXG4vLy8gcGFydGljdWxhciBuYW1lOyBmb3IgZXhhbXBsZSwgZGF0YSBjb250ZXh0cyBhcmUgc3RvcmVkIG9uIFZpZXdzXG4vLy8gb2YgbmFtZSBcIndpdGhcIi4gIE5hbWVzIGFyZSBhbHNvIHVzZWZ1bCB3aGVuIGRlYnVnZ2luZywgc28gaW5cbi8vLyBnZW5lcmFsIGl0J3MgZ29vZCBmb3IgZnVuY3Rpb25zIHRoYXQgY3JlYXRlIFZpZXdzIHRvIHNldCB0aGUgbmFtZS5cbi8vLyBWaWV3cyBhc3NvY2lhdGVkIHdpdGggdGVtcGxhdGVzIGhhdmUgbmFtZXMgb2YgdGhlIGZvcm0gXCJUZW1wbGF0ZS5mb29cIi5cblxuLyoqXG4gKiBAY2xhc3NcbiAqIEBzdW1tYXJ5IENvbnN0cnVjdG9yIGZvciBhIFZpZXcsIHdoaWNoIHJlcHJlc2VudHMgYSByZWFjdGl2ZSByZWdpb24gb2YgRE9NLlxuICogQGxvY3VzIENsaWVudFxuICogQHBhcmFtIHtTdHJpbmd9IFtuYW1lXSBPcHRpb25hbC4gIEEgbmFtZSBmb3IgdGhpcyB0eXBlIG9mIFZpZXcuICBTZWUgW2B2aWV3Lm5hbWVgXSgjdmlld19uYW1lKS5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IHJlbmRlckZ1bmN0aW9uIEEgZnVuY3Rpb24gdGhhdCByZXR1cm5zIFsqcmVuZGVyYWJsZSBjb250ZW50Kl0oI1JlbmRlcmFibGUtQ29udGVudCkuICBJbiB0aGlzIGZ1bmN0aW9uLCBgdGhpc2AgaXMgYm91bmQgdG8gdGhlIFZpZXcuXG4gKi9cbkJsYXplLlZpZXcgPSBmdW5jdGlvbiAobmFtZSwgcmVuZGVyKSB7XG4gIGlmICghICh0aGlzIGluc3RhbmNlb2YgQmxhemUuVmlldykpXG4gICAgLy8gY2FsbGVkIHdpdGhvdXQgYG5ld2BcbiAgICByZXR1cm4gbmV3IEJsYXplLlZpZXcobmFtZSwgcmVuZGVyKTtcblxuICBpZiAodHlwZW9mIG5hbWUgPT09ICdmdW5jdGlvbicpIHtcbiAgICAvLyBvbWl0dGVkIFwibmFtZVwiIGFyZ3VtZW50XG4gICAgcmVuZGVyID0gbmFtZTtcbiAgICBuYW1lID0gJyc7XG4gIH1cbiAgdGhpcy5uYW1lID0gbmFtZTtcbiAgdGhpcy5fcmVuZGVyID0gcmVuZGVyO1xuXG4gIHRoaXMuX2NhbGxiYWNrcyA9IHtcbiAgICBjcmVhdGVkOiBudWxsLFxuICAgIHJlbmRlcmVkOiBudWxsLFxuICAgIGRlc3Ryb3llZDogbnVsbFxuICB9O1xuXG4gIC8vIFNldHRpbmcgYWxsIHByb3BlcnRpZXMgaGVyZSBpcyBnb29kIGZvciByZWFkYWJpbGl0eSxcbiAgLy8gYW5kIGFsc28gbWF5IGhlbHAgQ2hyb21lIG9wdGltaXplIHRoZSBjb2RlIGJ5IGtlZXBpbmdcbiAgLy8gdGhlIFZpZXcgb2JqZWN0IGZyb20gY2hhbmdpbmcgc2hhcGUgdG9vIG11Y2guXG4gIHRoaXMuaXNDcmVhdGVkID0gZmFsc2U7XG4gIHRoaXMuX2lzQ3JlYXRlZEZvckV4cGFuc2lvbiA9IGZhbHNlO1xuICB0aGlzLmlzUmVuZGVyZWQgPSBmYWxzZTtcbiAgdGhpcy5faXNBdHRhY2hlZCA9IGZhbHNlO1xuICB0aGlzLmlzRGVzdHJveWVkID0gZmFsc2U7XG4gIHRoaXMuX2lzSW5SZW5kZXIgPSBmYWxzZTtcbiAgdGhpcy5wYXJlbnRWaWV3ID0gbnVsbDtcbiAgdGhpcy5fZG9tcmFuZ2UgPSBudWxsO1xuICAvLyBUaGlzIGZsYWcgaXMgbm9ybWFsbHkgc2V0IHRvIGZhbHNlIGV4Y2VwdCBmb3IgdGhlIGNhc2VzIHdoZW4gdmlldydzIHBhcmVudFxuICAvLyB3YXMgZ2VuZXJhdGVkIGFzIHBhcnQgb2YgZXhwYW5kaW5nIHNvbWUgc3ludGFjdGljIHN1Z2FyIGV4cHJlc3Npb25zIG9yXG4gIC8vIG1ldGhvZHMuXG4gIC8vIEV4LjogQmxhemUucmVuZGVyV2l0aERhdGEgaXMgYW4gZXF1aXZhbGVudCB0byBjcmVhdGluZyBhIHZpZXcgd2l0aCByZWd1bGFyXG4gIC8vIEJsYXplLnJlbmRlciBhbmQgd3JhcHBpbmcgaXQgaW50byB7eyN3aXRoIGRhdGF9fXt7L3dpdGh9fSB2aWV3LiBTaW5jZSB0aGVcbiAgLy8gdXNlcnMgZG9uJ3Qga25vdyBhbnl0aGluZyBhYm91dCB0aGVzZSBnZW5lcmF0ZWQgcGFyZW50IHZpZXdzLCBCbGF6ZSBuZWVkc1xuICAvLyB0aGlzIGluZm9ybWF0aW9uIHRvIGJlIGF2YWlsYWJsZSBvbiB2aWV3cyB0byBtYWtlIHNtYXJ0ZXIgZGVjaXNpb25zLiBGb3JcbiAgLy8gZXhhbXBsZTogcmVtb3ZpbmcgdGhlIGdlbmVyYXRlZCBwYXJlbnQgdmlldyB3aXRoIHRoZSB2aWV3IG9uIEJsYXplLnJlbW92ZS5cbiAgdGhpcy5faGFzR2VuZXJhdGVkUGFyZW50ID0gZmFsc2U7XG4gIC8vIEJpbmRpbmdzIGFjY2Vzc2libGUgdG8gY2hpbGRyZW4gdmlld3MgKHZpYSB2aWV3Lmxvb2t1cCgnbmFtZScpKSB3aXRoaW4gdGhlXG4gIC8vIGNsb3Nlc3QgdGVtcGxhdGUgdmlldy5cbiAgdGhpcy5fc2NvcGVCaW5kaW5ncyA9IHt9O1xuXG4gIHRoaXMucmVuZGVyQ291bnQgPSAwO1xufTtcblxuQmxhemUuVmlldy5wcm90b3R5cGUuX3JlbmRlciA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuIG51bGw7IH07XG5cbkJsYXplLlZpZXcucHJvdG90eXBlLm9uVmlld0NyZWF0ZWQgPSBmdW5jdGlvbiAoY2IpIHtcbiAgdGhpcy5fY2FsbGJhY2tzLmNyZWF0ZWQgPSB0aGlzLl9jYWxsYmFja3MuY3JlYXRlZCB8fCBbXTtcbiAgdGhpcy5fY2FsbGJhY2tzLmNyZWF0ZWQucHVzaChjYik7XG59O1xuXG5CbGF6ZS5WaWV3LnByb3RvdHlwZS5fb25WaWV3UmVuZGVyZWQgPSBmdW5jdGlvbiAoY2IpIHtcbiAgdGhpcy5fY2FsbGJhY2tzLnJlbmRlcmVkID0gdGhpcy5fY2FsbGJhY2tzLnJlbmRlcmVkIHx8IFtdO1xuICB0aGlzLl9jYWxsYmFja3MucmVuZGVyZWQucHVzaChjYik7XG59O1xuXG5CbGF6ZS5WaWV3LnByb3RvdHlwZS5vblZpZXdSZWFkeSA9IGZ1bmN0aW9uIChjYikge1xuICB2YXIgc2VsZiA9IHRoaXM7XG4gIHZhciBmaXJlID0gZnVuY3Rpb24gKCkge1xuICAgIFRyYWNrZXIuYWZ0ZXJGbHVzaChmdW5jdGlvbiAoKSB7XG4gICAgICBpZiAoISBzZWxmLmlzRGVzdHJveWVkKSB7XG4gICAgICAgIEJsYXplLl93aXRoQ3VycmVudFZpZXcoc2VsZiwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGNiLmNhbGwoc2VsZik7XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH0pO1xuICB9O1xuICBzZWxmLl9vblZpZXdSZW5kZXJlZChmdW5jdGlvbiBvblZpZXdSZW5kZXJlZCgpIHtcbiAgICBpZiAoc2VsZi5pc0Rlc3Ryb3llZClcbiAgICAgIHJldHVybjtcbiAgICBpZiAoISBzZWxmLl9kb21yYW5nZS5hdHRhY2hlZClcbiAgICAgIHNlbGYuX2RvbXJhbmdlLm9uQXR0YWNoZWQoZmlyZSk7XG4gICAgZWxzZVxuICAgICAgZmlyZSgpO1xuICB9KTtcbn07XG5cbkJsYXplLlZpZXcucHJvdG90eXBlLm9uVmlld0Rlc3Ryb3llZCA9IGZ1bmN0aW9uIChjYikge1xuICB0aGlzLl9jYWxsYmFja3MuZGVzdHJveWVkID0gdGhpcy5fY2FsbGJhY2tzLmRlc3Ryb3llZCB8fCBbXTtcbiAgdGhpcy5fY2FsbGJhY2tzLmRlc3Ryb3llZC5wdXNoKGNiKTtcbn07XG5CbGF6ZS5WaWV3LnByb3RvdHlwZS5yZW1vdmVWaWV3RGVzdHJveWVkTGlzdGVuZXIgPSBmdW5jdGlvbiAoY2IpIHtcbiAgdmFyIGRlc3Ryb3llZCA9IHRoaXMuX2NhbGxiYWNrcy5kZXN0cm95ZWQ7XG4gIGlmICghIGRlc3Ryb3llZClcbiAgICByZXR1cm47XG4gIHZhciBpbmRleCA9IGRlc3Ryb3llZC5sYXN0SW5kZXhPZihjYik7XG4gIGlmIChpbmRleCAhPT0gLTEpIHtcbiAgICAvLyBYWFggWW91J2QgdGhpbmsgdGhlIHJpZ2h0IHRoaW5nIHRvIGRvIHdvdWxkIGJlIHNwbGljZSwgYnV0IF9maXJlQ2FsbGJhY2tzXG4gICAgLy8gZ2V0cyBzYWQgaWYgeW91IHJlbW92ZSBjYWxsYmFja3Mgd2hpbGUgaXRlcmF0aW5nIG92ZXIgdGhlIGxpc3QuICBTaG91bGRcbiAgICAvLyBjaGFuZ2UgdGhpcyB0byB1c2UgY2FsbGJhY2staG9vayBvciBFdmVudEVtaXR0ZXIgb3Igc29tZXRoaW5nIGVsc2UgdGhhdFxuICAgIC8vIHByb3Blcmx5IHN1cHBvcnRzIHJlbW92YWwuXG4gICAgZGVzdHJveWVkW2luZGV4XSA9IG51bGw7XG4gIH1cbn07XG5cbi8vLyBWaWV3I2F1dG9ydW4oZnVuYylcbi8vL1xuLy8vIFNldHMgdXAgYSBUcmFja2VyIGF1dG9ydW4gdGhhdCBpcyBcInNjb3BlZFwiIHRvIHRoaXMgVmlldyBpbiB0d29cbi8vLyBpbXBvcnRhbnQgd2F5czogMSkgQmxhemUuY3VycmVudFZpZXcgaXMgYXV0b21hdGljYWxseSBzZXRcbi8vLyBvbiBldmVyeSByZS1ydW4sIGFuZCAyKSB0aGUgYXV0b3J1biBpcyBzdG9wcGVkIHdoZW4gdGhlXG4vLy8gVmlldyBpcyBkZXN0cm95ZWQuICBBcyB3aXRoIFRyYWNrZXIuYXV0b3J1biwgdGhlIGZpcnN0IHJ1biBvZlxuLy8vIHRoZSBmdW5jdGlvbiBpcyBpbW1lZGlhdGUsIGFuZCBhIENvbXB1dGF0aW9uIG9iamVjdCB0aGF0IGNhblxuLy8vIGJlIHVzZWQgdG8gc3RvcCB0aGUgYXV0b3J1biBpcyByZXR1cm5lZC5cbi8vL1xuLy8vIFZpZXcjYXV0b3J1biBpcyBtZWFudCB0byBiZSBjYWxsZWQgZnJvbSBWaWV3IGNhbGxiYWNrcyBsaWtlXG4vLy8gb25WaWV3Q3JlYXRlZCwgb3IgZnJvbSBvdXRzaWRlIHRoZSByZW5kZXJpbmcgcHJvY2Vzcy4gIEl0IG1heSBub3Rcbi8vLyBiZSBjYWxsZWQgYmVmb3JlIHRoZSBvblZpZXdDcmVhdGVkIGNhbGxiYWNrcyBhcmUgZmlyZWQgKHRvbyBlYXJseSksXG4vLy8gb3IgZnJvbSBhIHJlbmRlcigpIG1ldGhvZCAodG9vIGNvbmZ1c2luZykuXG4vLy9cbi8vLyBUeXBpY2FsbHksIGF1dG9ydW5zIHRoYXQgdXBkYXRlIHRoZSBzdGF0ZVxuLy8vIG9mIHRoZSBWaWV3IChhcyBpbiBCbGF6ZS5XaXRoKSBzaG91bGQgYmUgc3RhcnRlZCBmcm9tIGFuIG9uVmlld0NyZWF0ZWRcbi8vLyBjYWxsYmFjay4gIEF1dG9ydW5zIHRoYXQgdXBkYXRlIHRoZSBET00gc2hvdWxkIGJlIHN0YXJ0ZWRcbi8vLyBmcm9tIGVpdGhlciBvblZpZXdDcmVhdGVkIChndWFyZGVkIGFnYWluc3QgdGhlIGFic2VuY2Ugb2Zcbi8vLyB2aWV3Ll9kb21yYW5nZSksIG9yIG9uVmlld1JlYWR5LlxuQmxhemUuVmlldy5wcm90b3R5cGUuYXV0b3J1biA9IGZ1bmN0aW9uIChmLCBfaW5WaWV3U2NvcGUsIGRpc3BsYXlOYW1lKSB7XG4gIHZhciBzZWxmID0gdGhpcztcblxuICAvLyBUaGUgcmVzdHJpY3Rpb25zIG9uIHdoZW4gVmlldyNhdXRvcnVuIGNhbiBiZSBjYWxsZWQgYXJlIGluIG9yZGVyXG4gIC8vIHRvIGF2b2lkIGJhZCBwYXR0ZXJucywgbGlrZSBjcmVhdGluZyBhIEJsYXplLlZpZXcgYW5kIGltbWVkaWF0ZWx5XG4gIC8vIGNhbGxpbmcgYXV0b3J1biBvbiBpdC4gIEEgZnJlc2hseSBjcmVhdGVkIFZpZXcgaXMgbm90IHJlYWR5IHRvXG4gIC8vIGhhdmUgbG9naWMgcnVuIG9uIGl0OyBpdCBkb2Vzbid0IGhhdmUgYSBwYXJlbnRWaWV3LCBmb3IgZXhhbXBsZS5cbiAgLy8gSXQncyB3aGVuIHRoZSBWaWV3IGlzIG1hdGVyaWFsaXplZCBvciBleHBhbmRlZCB0aGF0IHRoZSBvblZpZXdDcmVhdGVkXG4gIC8vIGhhbmRsZXJzIGFyZSBmaXJlZCBhbmQgdGhlIFZpZXcgc3RhcnRzIHVwLlxuICAvL1xuICAvLyBMZXR0aW5nIHRoZSByZW5kZXIoKSBtZXRob2QgY2FsbCBgdGhpcy5hdXRvcnVuKClgIGlzIHByb2JsZW1hdGljXG4gIC8vIGJlY2F1c2Ugb2YgcmUtcmVuZGVyLiAgVGhlIGJlc3Qgd2UgY2FuIGRvIGlzIHRvIHN0b3AgdGhlIG9sZFxuICAvLyBhdXRvcnVuIGFuZCBzdGFydCBhIG5ldyBvbmUgZm9yIGVhY2ggcmVuZGVyLCBidXQgdGhhdCdzIGEgcGF0dGVyblxuICAvLyB3ZSB0cnkgdG8gYXZvaWQgaW50ZXJuYWxseSBiZWNhdXNlIGl0IGxlYWRzIHRvIGhlbHBlcnMgYmVpbmdcbiAgLy8gY2FsbGVkIGV4dHJhIHRpbWVzLCBpbiB0aGUgY2FzZSB3aGVyZSB0aGUgYXV0b3J1biBjYXVzZXMgdGhlXG4gIC8vIHZpZXcgdG8gcmUtcmVuZGVyIChhbmQgdGh1cyB0aGUgYXV0b3J1biB0byBiZSB0b3JuIGRvd24gYW5kIGFcbiAgLy8gbmV3IG9uZSBlc3RhYmxpc2hlZCkuXG4gIC8vXG4gIC8vIFdlIGNvdWxkIGxpZnQgdGhlc2UgcmVzdHJpY3Rpb25zIGluIHZhcmlvdXMgd2F5cy4gIE9uZSBpbnRlcmVzdGluZ1xuICAvLyBpZGVhIGlzIHRvIGFsbG93IHlvdSB0byBjYWxsIGB2aWV3LmF1dG9ydW5gIGFmdGVyIGluc3RhbnRpYXRpbmdcbiAgLy8gYHZpZXdgLCBhbmQgYXV0b21hdGljYWxseSB3cmFwIGl0IGluIGB2aWV3Lm9uVmlld0NyZWF0ZWRgLCBkZWZlcnJpbmdcbiAgLy8gdGhlIGF1dG9ydW4gc28gdGhhdCBpdCBzdGFydHMgYXQgYW4gYXBwcm9wcmlhdGUgdGltZS4gIEhvd2V2ZXIsXG4gIC8vIHRoZW4gd2UgY2FuJ3QgcmV0dXJuIHRoZSBDb21wdXRhdGlvbiBvYmplY3QgdG8gdGhlIGNhbGxlciwgYmVjYXVzZVxuICAvLyBpdCBkb2Vzbid0IGV4aXN0IHlldC5cbiAgaWYgKCEgc2VsZi5pc0NyZWF0ZWQpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJWaWV3I2F1dG9ydW4gbXVzdCBiZSBjYWxsZWQgZnJvbSB0aGUgY3JlYXRlZCBjYWxsYmFjayBhdCB0aGUgZWFybGllc3RcIik7XG4gIH1cbiAgaWYgKHRoaXMuX2lzSW5SZW5kZXIpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJDYW4ndCBjYWxsIFZpZXcjYXV0b3J1biBmcm9tIGluc2lkZSByZW5kZXIoKTsgdHJ5IGNhbGxpbmcgaXQgZnJvbSB0aGUgY3JlYXRlZCBvciByZW5kZXJlZCBjYWxsYmFja1wiKTtcbiAgfVxuXG4gIHZhciB0ZW1wbGF0ZUluc3RhbmNlRnVuYyA9IEJsYXplLlRlbXBsYXRlLl9jdXJyZW50VGVtcGxhdGVJbnN0YW5jZUZ1bmM7XG5cbiAgdmFyIGZ1bmMgPSBmdW5jdGlvbiB2aWV3QXV0b3J1bihjKSB7XG4gICAgcmV0dXJuIEJsYXplLl93aXRoQ3VycmVudFZpZXcoX2luVmlld1Njb3BlIHx8IHNlbGYsIGZ1bmN0aW9uICgpIHtcbiAgICAgIHJldHVybiBCbGF6ZS5UZW1wbGF0ZS5fd2l0aFRlbXBsYXRlSW5zdGFuY2VGdW5jKFxuICAgICAgICB0ZW1wbGF0ZUluc3RhbmNlRnVuYywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHJldHVybiBmLmNhbGwoc2VsZiwgYyk7XG4gICAgICAgIH0pO1xuICAgIH0pO1xuICB9O1xuXG4gIC8vIEdpdmUgdGhlIGF1dG9ydW4gZnVuY3Rpb24gYSBiZXR0ZXIgbmFtZSBmb3IgZGVidWdnaW5nIGFuZCBwcm9maWxpbmcuXG4gIC8vIFRoZSBgZGlzcGxheU5hbWVgIHByb3BlcnR5IGlzIG5vdCBwYXJ0IG9mIHRoZSBzcGVjIGJ1dCBicm93c2VycyBsaWtlIENocm9tZVxuICAvLyBhbmQgRmlyZWZveCBwcmVmZXIgaXQgaW4gZGVidWdnZXJzIG92ZXIgdGhlIG5hbWUgZnVuY3Rpb24gd2FzIGRlY2xhcmVkIGJ5LlxuICBmdW5jLmRpc3BsYXlOYW1lID1cbiAgICAoc2VsZi5uYW1lIHx8ICdhbm9ueW1vdXMnKSArICc6JyArIChkaXNwbGF5TmFtZSB8fCAnYW5vbnltb3VzJyk7XG4gIHZhciBjb21wID0gVHJhY2tlci5hdXRvcnVuKGZ1bmMpO1xuXG4gIHZhciBzdG9wQ29tcHV0YXRpb24gPSBmdW5jdGlvbiAoKSB7IGNvbXAuc3RvcCgpOyB9O1xuICBzZWxmLm9uVmlld0Rlc3Ryb3llZChzdG9wQ29tcHV0YXRpb24pO1xuICBjb21wLm9uU3RvcChmdW5jdGlvbiAoKSB7XG4gICAgc2VsZi5yZW1vdmVWaWV3RGVzdHJveWVkTGlzdGVuZXIoc3RvcENvbXB1dGF0aW9uKTtcbiAgfSk7XG5cbiAgcmV0dXJuIGNvbXA7XG59O1xuXG5CbGF6ZS5WaWV3LnByb3RvdHlwZS5fZXJyb3JJZlNob3VsZG50Q2FsbFN1YnNjcmliZSA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gIGlmICghIHNlbGYuaXNDcmVhdGVkKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwiVmlldyNzdWJzY3JpYmUgbXVzdCBiZSBjYWxsZWQgZnJvbSB0aGUgY3JlYXRlZCBjYWxsYmFjayBhdCB0aGUgZWFybGllc3RcIik7XG4gIH1cbiAgaWYgKHNlbGYuX2lzSW5SZW5kZXIpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJDYW4ndCBjYWxsIFZpZXcjc3Vic2NyaWJlIGZyb20gaW5zaWRlIHJlbmRlcigpOyB0cnkgY2FsbGluZyBpdCBmcm9tIHRoZSBjcmVhdGVkIG9yIHJlbmRlcmVkIGNhbGxiYWNrXCIpO1xuICB9XG4gIGlmIChzZWxmLmlzRGVzdHJveWVkKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwiQ2FuJ3QgY2FsbCBWaWV3I3N1YnNjcmliZSBmcm9tIGluc2lkZSB0aGUgZGVzdHJveWVkIGNhbGxiYWNrLCB0cnkgY2FsbGluZyBpdCBpbnNpZGUgY3JlYXRlZCBvciByZW5kZXJlZC5cIik7XG4gIH1cbn07XG5cbi8qKlxuICogSnVzdCBsaWtlIEJsYXplLlZpZXcjYXV0b3J1biwgYnV0IHdpdGggTWV0ZW9yLnN1YnNjcmliZSBpbnN0ZWFkIG9mXG4gKiBUcmFja2VyLmF1dG9ydW4uIFN0b3AgdGhlIHN1YnNjcmlwdGlvbiB3aGVuIHRoZSB2aWV3IGlzIGRlc3Ryb3llZC5cbiAqIEByZXR1cm4ge1N1YnNjcmlwdGlvbkhhbmRsZX0gQSBoYW5kbGUgdG8gdGhlIHN1YnNjcmlwdGlvbiBzbyB0aGF0IHlvdSBjYW5cbiAqIHNlZSBpZiBpdCBpcyByZWFkeSwgb3Igc3RvcCBpdCBtYW51YWxseVxuICovXG5CbGF6ZS5WaWV3LnByb3RvdHlwZS5zdWJzY3JpYmUgPSBmdW5jdGlvbiAoYXJncywgb3B0aW9ucykge1xuICB2YXIgc2VsZiA9IHRoaXM7XG4gIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuXG4gIHNlbGYuX2Vycm9ySWZTaG91bGRudENhbGxTdWJzY3JpYmUoKTtcblxuICB2YXIgc3ViSGFuZGxlO1xuICBpZiAob3B0aW9ucy5jb25uZWN0aW9uKSB7XG4gICAgc3ViSGFuZGxlID0gb3B0aW9ucy5jb25uZWN0aW9uLnN1YnNjcmliZS5hcHBseShvcHRpb25zLmNvbm5lY3Rpb24sIGFyZ3MpO1xuICB9IGVsc2Uge1xuICAgIHN1YkhhbmRsZSA9IE1ldGVvci5zdWJzY3JpYmUuYXBwbHkoTWV0ZW9yLCBhcmdzKTtcbiAgfVxuXG4gIHNlbGYub25WaWV3RGVzdHJveWVkKGZ1bmN0aW9uICgpIHtcbiAgICBzdWJIYW5kbGUuc3RvcCgpO1xuICB9KTtcblxuICByZXR1cm4gc3ViSGFuZGxlO1xufTtcblxuQmxhemUuVmlldy5wcm90b3R5cGUuZmlyc3ROb2RlID0gZnVuY3Rpb24gKCkge1xuICBpZiAoISB0aGlzLl9pc0F0dGFjaGVkKVxuICAgIHRocm93IG5ldyBFcnJvcihcIlZpZXcgbXVzdCBiZSBhdHRhY2hlZCBiZWZvcmUgYWNjZXNzaW5nIGl0cyBET01cIik7XG5cbiAgcmV0dXJuIHRoaXMuX2RvbXJhbmdlLmZpcnN0Tm9kZSgpO1xufTtcblxuQmxhemUuVmlldy5wcm90b3R5cGUubGFzdE5vZGUgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICghIHRoaXMuX2lzQXR0YWNoZWQpXG4gICAgdGhyb3cgbmV3IEVycm9yKFwiVmlldyBtdXN0IGJlIGF0dGFjaGVkIGJlZm9yZSBhY2Nlc3NpbmcgaXRzIERPTVwiKTtcblxuICByZXR1cm4gdGhpcy5fZG9tcmFuZ2UubGFzdE5vZGUoKTtcbn07XG5cbkJsYXplLl9maXJlQ2FsbGJhY2tzID0gZnVuY3Rpb24gKHZpZXcsIHdoaWNoKSB7XG4gIEJsYXplLl93aXRoQ3VycmVudFZpZXcodmlldywgZnVuY3Rpb24gKCkge1xuICAgIFRyYWNrZXIubm9ucmVhY3RpdmUoZnVuY3Rpb24gZmlyZUNhbGxiYWNrcygpIHtcbiAgICAgIHZhciBjYnMgPSB2aWV3Ll9jYWxsYmFja3Nbd2hpY2hdO1xuICAgICAgZm9yICh2YXIgaSA9IDAsIE4gPSAoY2JzICYmIGNicy5sZW5ndGgpOyBpIDwgTjsgaSsrKVxuICAgICAgICBjYnNbaV0gJiYgY2JzW2ldLmNhbGwodmlldyk7XG4gICAgfSk7XG4gIH0pO1xufTtcblxuQmxhemUuX2NyZWF0ZVZpZXcgPSBmdW5jdGlvbiAodmlldywgcGFyZW50VmlldywgZm9yRXhwYW5zaW9uKSB7XG4gIGlmICh2aWV3LmlzQ3JlYXRlZClcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJDYW4ndCByZW5kZXIgdGhlIHNhbWUgVmlldyB0d2ljZVwiKTtcblxuICB2aWV3LnBhcmVudFZpZXcgPSAocGFyZW50VmlldyB8fCBudWxsKTtcbiAgdmlldy5pc0NyZWF0ZWQgPSB0cnVlO1xuICBpZiAoZm9yRXhwYW5zaW9uKVxuICAgIHZpZXcuX2lzQ3JlYXRlZEZvckV4cGFuc2lvbiA9IHRydWU7XG5cbiAgQmxhemUuX2ZpcmVDYWxsYmFja3ModmlldywgJ2NyZWF0ZWQnKTtcbn07XG5cbnZhciBkb0ZpcnN0UmVuZGVyID0gZnVuY3Rpb24gKHZpZXcsIGluaXRpYWxDb250ZW50KSB7XG4gIHZhciBkb21yYW5nZSA9IG5ldyBCbGF6ZS5fRE9NUmFuZ2UoaW5pdGlhbENvbnRlbnQpO1xuICB2aWV3Ll9kb21yYW5nZSA9IGRvbXJhbmdlO1xuICBkb21yYW5nZS52aWV3ID0gdmlldztcbiAgdmlldy5pc1JlbmRlcmVkID0gdHJ1ZTtcbiAgQmxhemUuX2ZpcmVDYWxsYmFja3ModmlldywgJ3JlbmRlcmVkJyk7XG5cbiAgdmFyIHRlYXJkb3duSG9vayA9IG51bGw7XG5cbiAgZG9tcmFuZ2Uub25BdHRhY2hlZChmdW5jdGlvbiBhdHRhY2hlZChyYW5nZSwgZWxlbWVudCkge1xuICAgIHZpZXcuX2lzQXR0YWNoZWQgPSB0cnVlO1xuXG4gICAgdGVhcmRvd25Ib29rID0gQmxhemUuX0RPTUJhY2tlbmQuVGVhcmRvd24ub25FbGVtZW50VGVhcmRvd24oXG4gICAgICBlbGVtZW50LCBmdW5jdGlvbiB0ZWFyZG93bigpIHtcbiAgICAgICAgQmxhemUuX2Rlc3Ryb3lWaWV3KHZpZXcsIHRydWUgLyogX3NraXBOb2RlcyAqLyk7XG4gICAgICB9KTtcbiAgfSk7XG5cbiAgLy8gdGVhciBkb3duIHRoZSB0ZWFyZG93biBob29rXG4gIHZpZXcub25WaWV3RGVzdHJveWVkKGZ1bmN0aW9uICgpIHtcbiAgICB0ZWFyZG93bkhvb2sgJiYgdGVhcmRvd25Ib29rLnN0b3AoKTtcbiAgICB0ZWFyZG93bkhvb2sgPSBudWxsO1xuICB9KTtcblxuICByZXR1cm4gZG9tcmFuZ2U7XG59O1xuXG4vLyBUYWtlIGFuIHVuY3JlYXRlZCBWaWV3IGB2aWV3YCBhbmQgY3JlYXRlIGFuZCByZW5kZXIgaXQgdG8gRE9NLFxuLy8gc2V0dGluZyB1cCB0aGUgYXV0b3J1biB0aGF0IHVwZGF0ZXMgdGhlIFZpZXcuICBSZXR1cm5zIGEgbmV3XG4vLyBET01SYW5nZSwgd2hpY2ggaGFzIGJlZW4gYXNzb2NpYXRlZCB3aXRoIHRoZSBWaWV3LlxuLy9cbi8vIFRoZSBwcml2YXRlIGFyZ3VtZW50cyBgX3dvcmtTdGFja2AgYW5kIGBfaW50b0FycmF5YCBhcmUgcGFzc2VkIGluXG4vLyBieSBCbGF6ZS5fbWF0ZXJpYWxpemVET00gYW5kIGFyZSBvbmx5IHByZXNlbnQgZm9yIHJlY3Vyc2l2ZSBjYWxsc1xuLy8gKHdoZW4gdGhlcmUgaXMgc29tZSBvdGhlciBfbWF0ZXJpYWxpemVWaWV3IG9uIHRoZSBzdGFjaykuICBJZlxuLy8gcHJvdmlkZWQsIHRoZW4gd2UgYXZvaWQgdGhlIG11dHVhbCByZWN1cnNpb24gb2YgY2FsbGluZyBiYWNrIGludG9cbi8vIEJsYXplLl9tYXRlcmlhbGl6ZURPTSBzbyB0aGF0IGRlZXAgVmlldyBoaWVyYXJjaGllcyBkb24ndCBibG93IHRoZVxuLy8gc3RhY2suICBJbnN0ZWFkLCB3ZSBwdXNoIHRhc2tzIG9udG8gd29ya1N0YWNrIGZvciB0aGUgaW5pdGlhbFxuLy8gcmVuZGVyaW5nIGFuZCBzdWJzZXF1ZW50IHNldHVwIG9mIHRoZSBWaWV3LCBhbmQgdGhleSBhcmUgZG9uZSBhZnRlclxuLy8gd2UgcmV0dXJuLiAgV2hlbiB0aGVyZSBpcyBhIF93b3JrU3RhY2ssIHdlIGRvIG5vdCByZXR1cm4gdGhlIG5ld1xuLy8gRE9NUmFuZ2UsIGJ1dCBpbnN0ZWFkIHB1c2ggaXQgaW50byBfaW50b0FycmF5IGZyb20gYSBfd29ya1N0YWNrXG4vLyB0YXNrLlxuQmxhemUuX21hdGVyaWFsaXplVmlldyA9IGZ1bmN0aW9uICh2aWV3LCBwYXJlbnRWaWV3LCBfd29ya1N0YWNrLCBfaW50b0FycmF5KSB7XG4gIEJsYXplLl9jcmVhdGVWaWV3KHZpZXcsIHBhcmVudFZpZXcpO1xuXG4gIHZhciBkb21yYW5nZTtcbiAgdmFyIGxhc3RIdG1sanM7XG4gIC8vIFdlIGRvbid0IGV4cGVjdCB0byBiZSBjYWxsZWQgaW4gYSBDb21wdXRhdGlvbiwgYnV0IGp1c3QgaW4gY2FzZSxcbiAgLy8gd3JhcCBpbiBUcmFja2VyLm5vbnJlYWN0aXZlLlxuICBUcmFja2VyLm5vbnJlYWN0aXZlKGZ1bmN0aW9uICgpIHtcbiAgICB2aWV3LmF1dG9ydW4oZnVuY3Rpb24gZG9SZW5kZXIoYykge1xuICAgICAgLy8gYHZpZXcuYXV0b3J1bmAgc2V0cyB0aGUgY3VycmVudCB2aWV3LlxuICAgICAgdmlldy5yZW5kZXJDb3VudCsrO1xuICAgICAgdmlldy5faXNJblJlbmRlciA9IHRydWU7XG4gICAgICAvLyBBbnkgZGVwZW5kZW5jaWVzIHRoYXQgc2hvdWxkIGludmFsaWRhdGUgdGhpcyBDb21wdXRhdGlvbiBjb21lXG4gICAgICAvLyBmcm9tIHRoaXMgbGluZTpcbiAgICAgIHZhciBodG1sanMgPSB2aWV3Ll9yZW5kZXIoKTtcbiAgICAgIHZpZXcuX2lzSW5SZW5kZXIgPSBmYWxzZTtcblxuICAgICAgaWYgKCEgYy5maXJzdFJ1biAmJiAhIEJsYXplLl9pc0NvbnRlbnRFcXVhbChsYXN0SHRtbGpzLCBodG1sanMpKSB7XG4gICAgICAgIFRyYWNrZXIubm9ucmVhY3RpdmUoZnVuY3Rpb24gZG9NYXRlcmlhbGl6ZSgpIHtcbiAgICAgICAgICAvLyByZS1yZW5kZXJcbiAgICAgICAgICB2YXIgcmFuZ2VzQW5kTm9kZXMgPSBCbGF6ZS5fbWF0ZXJpYWxpemVET00oaHRtbGpzLCBbXSwgdmlldyk7XG4gICAgICAgICAgZG9tcmFuZ2Uuc2V0TWVtYmVycyhyYW5nZXNBbmROb2Rlcyk7XG4gICAgICAgICAgQmxhemUuX2ZpcmVDYWxsYmFja3ModmlldywgJ3JlbmRlcmVkJyk7XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgICAgbGFzdEh0bWxqcyA9IGh0bWxqcztcblxuICAgICAgLy8gQ2F1c2VzIGFueSBuZXN0ZWQgdmlld3MgdG8gc3RvcCBpbW1lZGlhdGVseSwgbm90IHdoZW4gd2UgY2FsbFxuICAgICAgLy8gYHNldE1lbWJlcnNgIHRoZSBuZXh0IHRpbWUgYXJvdW5kIHRoZSBhdXRvcnVuLiAgT3RoZXJ3aXNlLFxuICAgICAgLy8gaGVscGVycyBpbiB0aGUgRE9NIHRyZWUgdG8gYmUgcmVwbGFjZWQgbWlnaHQgYmUgc2NoZWR1bGVkXG4gICAgICAvLyB0byByZS1ydW4gYmVmb3JlIHdlIGhhdmUgYSBjaGFuY2UgdG8gc3RvcCB0aGVtLlxuICAgICAgVHJhY2tlci5vbkludmFsaWRhdGUoZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAoZG9tcmFuZ2UpIHtcbiAgICAgICAgICBkb21yYW5nZS5kZXN0cm95TWVtYmVycygpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9LCB1bmRlZmluZWQsICdtYXRlcmlhbGl6ZScpO1xuXG4gICAgLy8gZmlyc3QgcmVuZGVyLiAgbGFzdEh0bWxqcyBpcyB0aGUgZmlyc3QgaHRtbGpzLlxuICAgIHZhciBpbml0aWFsQ29udGVudHM7XG4gICAgaWYgKCEgX3dvcmtTdGFjaykge1xuICAgICAgaW5pdGlhbENvbnRlbnRzID0gQmxhemUuX21hdGVyaWFsaXplRE9NKGxhc3RIdG1sanMsIFtdLCB2aWV3KTtcbiAgICAgIGRvbXJhbmdlID0gZG9GaXJzdFJlbmRlcih2aWV3LCBpbml0aWFsQ29udGVudHMpO1xuICAgICAgaW5pdGlhbENvbnRlbnRzID0gbnVsbDsgLy8gaGVscCBHQyBiZWNhdXNlIHdlIGNsb3NlIG92ZXIgdGhpcyBzY29wZSBhIGxvdFxuICAgIH0gZWxzZSB7XG4gICAgICAvLyBXZSdyZSBiZWluZyBjYWxsZWQgZnJvbSBCbGF6ZS5fbWF0ZXJpYWxpemVET00sIHNvIHRvIGF2b2lkXG4gICAgICAvLyByZWN1cnNpb24gYW5kIHNhdmUgc3RhY2sgc3BhY2UsIHByb3ZpZGUgYSBkZXNjcmlwdGlvbiBvZiB0aGVcbiAgICAgIC8vIHdvcmsgdG8gYmUgZG9uZSBpbnN0ZWFkIG9mIGRvaW5nIGl0LiAgVGFza3MgcHVzaGVkIG9udG9cbiAgICAgIC8vIF93b3JrU3RhY2sgd2lsbCBiZSBkb25lIGluIExJRk8gb3JkZXIgYWZ0ZXIgd2UgcmV0dXJuLlxuICAgICAgLy8gVGhlIHdvcmsgd2lsbCBzdGlsbCBiZSBkb25lIHdpdGhpbiBhIFRyYWNrZXIubm9ucmVhY3RpdmUsXG4gICAgICAvLyBiZWNhdXNlIGl0IHdpbGwgYmUgZG9uZSBieSBzb21lIGNhbGwgdG8gQmxhemUuX21hdGVyaWFsaXplRE9NXG4gICAgICAvLyAod2hpY2ggaXMgYWx3YXlzIGNhbGxlZCBpbiBhIFRyYWNrZXIubm9ucmVhY3RpdmUpLlxuICAgICAgaW5pdGlhbENvbnRlbnRzID0gW107XG4gICAgICAvLyBwdXNoIHRoaXMgZnVuY3Rpb24gZmlyc3Qgc28gdGhhdCBpdCBoYXBwZW5zIGxhc3RcbiAgICAgIF93b3JrU3RhY2sucHVzaChmdW5jdGlvbiAoKSB7XG4gICAgICAgIGRvbXJhbmdlID0gZG9GaXJzdFJlbmRlcih2aWV3LCBpbml0aWFsQ29udGVudHMpO1xuICAgICAgICBpbml0aWFsQ29udGVudHMgPSBudWxsOyAvLyBoZWxwIEdDIGJlY2F1c2Ugb2YgYWxsIHRoZSBjbG9zdXJlcyBoZXJlXG4gICAgICAgIF9pbnRvQXJyYXkucHVzaChkb21yYW5nZSk7XG4gICAgICB9KTtcbiAgICAgIC8vIG5vdyBwdXNoIHRoZSB0YXNrIHRoYXQgY2FsY3VsYXRlcyBpbml0aWFsQ29udGVudHNcbiAgICAgIF93b3JrU3RhY2sucHVzaChCbGF6ZS5fYmluZChCbGF6ZS5fbWF0ZXJpYWxpemVET00sIG51bGwsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxhc3RIdG1sanMsIGluaXRpYWxDb250ZW50cywgdmlldywgX3dvcmtTdGFjaykpO1xuICAgIH1cbiAgfSk7XG5cbiAgaWYgKCEgX3dvcmtTdGFjaykge1xuICAgIHJldHVybiBkb21yYW5nZTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxufTtcblxuLy8gRXhwYW5kcyBhIFZpZXcgdG8gSFRNTGpzLCBjYWxsaW5nIGByZW5kZXJgIHJlY3Vyc2l2ZWx5IG9uIGFsbFxuLy8gVmlld3MgYW5kIGV2YWx1YXRpbmcgYW55IGR5bmFtaWMgYXR0cmlidXRlcy4gIENhbGxzIHRoZSBgY3JlYXRlZGBcbi8vIGNhbGxiYWNrLCBidXQgbm90IHRoZSBgbWF0ZXJpYWxpemVkYCBvciBgcmVuZGVyZWRgIGNhbGxiYWNrcy5cbi8vIERlc3Ryb3lzIHRoZSB2aWV3IGltbWVkaWF0ZWx5LCB1bmxlc3MgY2FsbGVkIGluIGEgVHJhY2tlciBDb21wdXRhdGlvbixcbi8vIGluIHdoaWNoIGNhc2UgdGhlIHZpZXcgd2lsbCBiZSBkZXN0cm95ZWQgd2hlbiB0aGUgQ29tcHV0YXRpb24gaXNcbi8vIGludmFsaWRhdGVkLiAgSWYgY2FsbGVkIGluIGEgVHJhY2tlciBDb21wdXRhdGlvbiwgdGhlIHJlc3VsdCBpcyBhXG4vLyByZWFjdGl2ZSBzdHJpbmc7IHRoYXQgaXMsIHRoZSBDb21wdXRhdGlvbiB3aWxsIGJlIGludmFsaWRhdGVkXG4vLyBpZiBhbnkgY2hhbmdlcyBhcmUgbWFkZSB0byB0aGUgdmlldyBvciBzdWJ2aWV3cyB0aGF0IG1pZ2h0IGFmZmVjdFxuLy8gdGhlIEhUTUwuXG5CbGF6ZS5fZXhwYW5kVmlldyA9IGZ1bmN0aW9uICh2aWV3LCBwYXJlbnRWaWV3KSB7XG4gIEJsYXplLl9jcmVhdGVWaWV3KHZpZXcsIHBhcmVudFZpZXcsIHRydWUgLypmb3JFeHBhbnNpb24qLyk7XG5cbiAgdmlldy5faXNJblJlbmRlciA9IHRydWU7XG4gIHZhciBodG1sanMgPSBCbGF6ZS5fd2l0aEN1cnJlbnRWaWV3KHZpZXcsIGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gdmlldy5fcmVuZGVyKCk7XG4gIH0pO1xuICB2aWV3Ll9pc0luUmVuZGVyID0gZmFsc2U7XG5cbiAgdmFyIHJlc3VsdCA9IEJsYXplLl9leHBhbmQoaHRtbGpzLCB2aWV3KTtcblxuICBpZiAoVHJhY2tlci5hY3RpdmUpIHtcbiAgICBUcmFja2VyLm9uSW52YWxpZGF0ZShmdW5jdGlvbiAoKSB7XG4gICAgICBCbGF6ZS5fZGVzdHJveVZpZXcodmlldyk7XG4gICAgfSk7XG4gIH0gZWxzZSB7XG4gICAgQmxhemUuX2Rlc3Ryb3lWaWV3KHZpZXcpO1xuICB9XG5cbiAgcmV0dXJuIHJlc3VsdDtcbn07XG5cbi8vIE9wdGlvbnM6IGBwYXJlbnRWaWV3YFxuQmxhemUuX0hUTUxKU0V4cGFuZGVyID0gSFRNTC5UcmFuc2Zvcm1pbmdWaXNpdG9yLmV4dGVuZCgpO1xuQmxhemUuX0hUTUxKU0V4cGFuZGVyLmRlZih7XG4gIHZpc2l0T2JqZWN0OiBmdW5jdGlvbiAoeCkge1xuICAgIGlmICh4IGluc3RhbmNlb2YgQmxhemUuVGVtcGxhdGUpXG4gICAgICB4ID0geC5jb25zdHJ1Y3RWaWV3KCk7XG4gICAgaWYgKHggaW5zdGFuY2VvZiBCbGF6ZS5WaWV3KVxuICAgICAgcmV0dXJuIEJsYXplLl9leHBhbmRWaWV3KHgsIHRoaXMucGFyZW50Vmlldyk7XG5cbiAgICAvLyB0aGlzIHdpbGwgdGhyb3cgYW4gZXJyb3I7IG90aGVyIG9iamVjdHMgYXJlIG5vdCBhbGxvd2VkIVxuICAgIHJldHVybiBIVE1MLlRyYW5zZm9ybWluZ1Zpc2l0b3IucHJvdG90eXBlLnZpc2l0T2JqZWN0LmNhbGwodGhpcywgeCk7XG4gIH0sXG4gIHZpc2l0QXR0cmlidXRlczogZnVuY3Rpb24gKGF0dHJzKSB7XG4gICAgLy8gZXhwYW5kIGR5bmFtaWMgYXR0cmlidXRlc1xuICAgIGlmICh0eXBlb2YgYXR0cnMgPT09ICdmdW5jdGlvbicpXG4gICAgICBhdHRycyA9IEJsYXplLl93aXRoQ3VycmVudFZpZXcodGhpcy5wYXJlbnRWaWV3LCBhdHRycyk7XG5cbiAgICAvLyBjYWxsIHN1cGVyIChlLmcuIGZvciBjYXNlIHdoZXJlIGBhdHRyc2AgaXMgYW4gYXJyYXkpXG4gICAgcmV0dXJuIEhUTUwuVHJhbnNmb3JtaW5nVmlzaXRvci5wcm90b3R5cGUudmlzaXRBdHRyaWJ1dGVzLmNhbGwodGhpcywgYXR0cnMpO1xuICB9LFxuICB2aXNpdEF0dHJpYnV0ZTogZnVuY3Rpb24gKG5hbWUsIHZhbHVlLCB0YWcpIHtcbiAgICAvLyBleHBhbmQgYXR0cmlidXRlIHZhbHVlcyB0aGF0IGFyZSBmdW5jdGlvbnMuICBBbnkgYXR0cmlidXRlIHZhbHVlXG4gICAgLy8gdGhhdCBjb250YWlucyBWaWV3cyBtdXN0IGJlIHdyYXBwZWQgaW4gYSBmdW5jdGlvbi5cbiAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnZnVuY3Rpb24nKVxuICAgICAgdmFsdWUgPSBCbGF6ZS5fd2l0aEN1cnJlbnRWaWV3KHRoaXMucGFyZW50VmlldywgdmFsdWUpO1xuXG4gICAgcmV0dXJuIEhUTUwuVHJhbnNmb3JtaW5nVmlzaXRvci5wcm90b3R5cGUudmlzaXRBdHRyaWJ1dGUuY2FsbChcbiAgICAgIHRoaXMsIG5hbWUsIHZhbHVlLCB0YWcpO1xuICB9XG59KTtcblxuLy8gUmV0dXJuIEJsYXplLmN1cnJlbnRWaWV3LCBidXQgb25seSBpZiBpdCBpcyBiZWluZyByZW5kZXJlZFxuLy8gKGkuZS4gd2UgYXJlIGluIGl0cyByZW5kZXIoKSBtZXRob2QpLlxudmFyIGN1cnJlbnRWaWV3SWZSZW5kZXJpbmcgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciB2aWV3ID0gQmxhemUuY3VycmVudFZpZXc7XG4gIHJldHVybiAodmlldyAmJiB2aWV3Ll9pc0luUmVuZGVyKSA/IHZpZXcgOiBudWxsO1xufTtcblxuQmxhemUuX2V4cGFuZCA9IGZ1bmN0aW9uIChodG1sanMsIHBhcmVudFZpZXcpIHtcbiAgcGFyZW50VmlldyA9IHBhcmVudFZpZXcgfHwgY3VycmVudFZpZXdJZlJlbmRlcmluZygpO1xuICByZXR1cm4gKG5ldyBCbGF6ZS5fSFRNTEpTRXhwYW5kZXIoXG4gICAge3BhcmVudFZpZXc6IHBhcmVudFZpZXd9KSkudmlzaXQoaHRtbGpzKTtcbn07XG5cbkJsYXplLl9leHBhbmRBdHRyaWJ1dGVzID0gZnVuY3Rpb24gKGF0dHJzLCBwYXJlbnRWaWV3KSB7XG4gIHBhcmVudFZpZXcgPSBwYXJlbnRWaWV3IHx8IGN1cnJlbnRWaWV3SWZSZW5kZXJpbmcoKTtcbiAgcmV0dXJuIChuZXcgQmxhemUuX0hUTUxKU0V4cGFuZGVyKFxuICAgIHtwYXJlbnRWaWV3OiBwYXJlbnRWaWV3fSkpLnZpc2l0QXR0cmlidXRlcyhhdHRycyk7XG59O1xuXG5CbGF6ZS5fZGVzdHJveVZpZXcgPSBmdW5jdGlvbiAodmlldywgX3NraXBOb2Rlcykge1xuICBpZiAodmlldy5pc0Rlc3Ryb3llZClcbiAgICByZXR1cm47XG4gIHZpZXcuaXNEZXN0cm95ZWQgPSB0cnVlO1xuXG5cbiAgLy8gRGVzdHJveSB2aWV3cyBhbmQgZWxlbWVudHMgcmVjdXJzaXZlbHkuICBJZiBfc2tpcE5vZGVzLFxuICAvLyBvbmx5IHJlY3Vyc2UgdXAgdG8gdmlld3MsIG5vdCBlbGVtZW50cywgZm9yIHRoZSBjYXNlIHdoZXJlXG4gIC8vIHRoZSBiYWNrZW5kIChqUXVlcnkpIGlzIHJlY3Vyc2luZyBvdmVyIHRoZSBlbGVtZW50cyBhbHJlYWR5LlxuXG4gIGlmICh2aWV3Ll9kb21yYW5nZSkgdmlldy5fZG9tcmFuZ2UuZGVzdHJveU1lbWJlcnMoX3NraXBOb2Rlcyk7XG5cbiAgLy8gWFhYOiBmaXJlIGNhbGxiYWNrcyBhZnRlciBwb3RlbnRpYWwgbWVtYmVycyBhcmUgZGVzdHJveWVkXG4gIC8vIG90aGVyd2lzZSBpdCdzIHRyYWNrZXIuZmx1c2ggd2lsbCBjYXVzZSB0aGUgYWJvdmUgbGluZSB3aWxsXG4gIC8vIG5vdCBiZSBjYWxsZWQgYW5kIHRoZWlyIHZpZXdzIHdvbid0IGJlIGRlc3Ryb3llZFxuICAvLyBJbnZvbHZlZCBpc3N1ZXM6IERPTVJhbmdlIFwiTXVzdCBiZSBhdHRhY2hlZFwiIGVycm9yLCBtZW0gbGVha1xuICBcbiAgQmxhemUuX2ZpcmVDYWxsYmFja3ModmlldywgJ2Rlc3Ryb3llZCcpO1xufTtcblxuQmxhemUuX2Rlc3Ryb3lOb2RlID0gZnVuY3Rpb24gKG5vZGUpIHtcbiAgaWYgKG5vZGUubm9kZVR5cGUgPT09IDEpXG4gICAgQmxhemUuX0RPTUJhY2tlbmQuVGVhcmRvd24udGVhckRvd25FbGVtZW50KG5vZGUpO1xufTtcblxuLy8gQXJlIHRoZSBIVE1ManMgZW50aXRpZXMgYGFgIGFuZCBgYmAgdGhlIHNhbWU/ICBXZSBjb3VsZCBiZVxuLy8gbW9yZSBlbGFib3JhdGUgaGVyZSBidXQgdGhlIHBvaW50IGlzIHRvIGNhdGNoIHRoZSBtb3N0IGJhc2ljXG4vLyBjYXNlcy5cbkJsYXplLl9pc0NvbnRlbnRFcXVhbCA9IGZ1bmN0aW9uIChhLCBiKSB7XG4gIGlmIChhIGluc3RhbmNlb2YgSFRNTC5SYXcpIHtcbiAgICByZXR1cm4gKGIgaW5zdGFuY2VvZiBIVE1MLlJhdykgJiYgKGEudmFsdWUgPT09IGIudmFsdWUpO1xuICB9IGVsc2UgaWYgKGEgPT0gbnVsbCkge1xuICAgIHJldHVybiAoYiA9PSBudWxsKTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gKGEgPT09IGIpICYmXG4gICAgICAoKHR5cGVvZiBhID09PSAnbnVtYmVyJykgfHwgKHR5cGVvZiBhID09PSAnYm9vbGVhbicpIHx8XG4gICAgICAgKHR5cGVvZiBhID09PSAnc3RyaW5nJykpO1xuICB9XG59O1xuXG4vKipcbiAqIEBzdW1tYXJ5IFRoZSBWaWV3IGNvcnJlc3BvbmRpbmcgdG8gdGhlIGN1cnJlbnQgdGVtcGxhdGUgaGVscGVyLCBldmVudCBoYW5kbGVyLCBjYWxsYmFjaywgb3IgYXV0b3J1bi4gIElmIHRoZXJlIGlzbid0IG9uZSwgYG51bGxgLlxuICogQGxvY3VzIENsaWVudFxuICogQHR5cGUge0JsYXplLlZpZXd9XG4gKi9cbkJsYXplLmN1cnJlbnRWaWV3ID0gbnVsbDtcblxuQmxhemUuX3dpdGhDdXJyZW50VmlldyA9IGZ1bmN0aW9uICh2aWV3LCBmdW5jKSB7XG4gIHZhciBvbGRWaWV3ID0gQmxhemUuY3VycmVudFZpZXc7XG4gIHRyeSB7XG4gICAgQmxhemUuY3VycmVudFZpZXcgPSB2aWV3O1xuICAgIHJldHVybiBmdW5jKCk7XG4gIH0gZmluYWxseSB7XG4gICAgQmxhemUuY3VycmVudFZpZXcgPSBvbGRWaWV3O1xuICB9XG59O1xuXG4vLyBCbGF6ZS5yZW5kZXIgcHVibGljbHkgdGFrZXMgYSBWaWV3IG9yIGEgVGVtcGxhdGUuXG4vLyBQcml2YXRlbHksIGl0IHRha2VzIGFueSBIVE1MSlMgKGV4dGVuZGVkIHdpdGggVmlld3MgYW5kIFRlbXBsYXRlcylcbi8vIGV4Y2VwdCBudWxsIG9yIHVuZGVmaW5lZCwgb3IgYSBmdW5jdGlvbiB0aGF0IHJldHVybnMgYW55IGV4dGVuZGVkXG4vLyBIVE1MSlMuXG52YXIgY2hlY2tSZW5kZXJDb250ZW50ID0gZnVuY3Rpb24gKGNvbnRlbnQpIHtcbiAgaWYgKGNvbnRlbnQgPT09IG51bGwpXG4gICAgdGhyb3cgbmV3IEVycm9yKFwiQ2FuJ3QgcmVuZGVyIG51bGxcIik7XG4gIGlmICh0eXBlb2YgY29udGVudCA9PT0gJ3VuZGVmaW5lZCcpXG4gICAgdGhyb3cgbmV3IEVycm9yKFwiQ2FuJ3QgcmVuZGVyIHVuZGVmaW5lZFwiKTtcblxuICBpZiAoKGNvbnRlbnQgaW5zdGFuY2VvZiBCbGF6ZS5WaWV3KSB8fFxuICAgICAgKGNvbnRlbnQgaW5zdGFuY2VvZiBCbGF6ZS5UZW1wbGF0ZSkgfHxcbiAgICAgICh0eXBlb2YgY29udGVudCA9PT0gJ2Z1bmN0aW9uJykpXG4gICAgcmV0dXJuO1xuXG4gIHRyeSB7XG4gICAgLy8gVGhyb3cgaWYgY29udGVudCBkb2Vzbid0IGxvb2sgbGlrZSBIVE1MSlMgYXQgdGhlIHRvcCBsZXZlbFxuICAgIC8vIChpLmUuIHZlcmlmeSB0aGF0IHRoaXMgaXMgYW4gSFRNTC5UYWcsIG9yIGFuIGFycmF5LFxuICAgIC8vIG9yIGEgcHJpbWl0aXZlLCBldGMuKVxuICAgIChuZXcgSFRNTC5WaXNpdG9yKS52aXNpdChjb250ZW50KTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIC8vIE1ha2UgZXJyb3IgbWVzc2FnZSBzdWl0YWJsZSBmb3IgcHVibGljIEFQSVxuICAgIHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGVkIFRlbXBsYXRlIG9yIFZpZXdcIik7XG4gIH1cbn07XG5cbi8vIEZvciBCbGF6ZS5yZW5kZXIgYW5kIEJsYXplLnRvSFRNTCwgdGFrZSBjb250ZW50IGFuZFxuLy8gd3JhcCBpdCBpbiBhIFZpZXcsIHVubGVzcyBpdCdzIGEgc2luZ2xlIFZpZXcgb3Jcbi8vIFRlbXBsYXRlIGFscmVhZHkuXG52YXIgY29udGVudEFzVmlldyA9IGZ1bmN0aW9uIChjb250ZW50KSB7XG4gIGNoZWNrUmVuZGVyQ29udGVudChjb250ZW50KTtcblxuICBpZiAoY29udGVudCBpbnN0YW5jZW9mIEJsYXplLlRlbXBsYXRlKSB7XG4gICAgcmV0dXJuIGNvbnRlbnQuY29uc3RydWN0VmlldygpO1xuICB9IGVsc2UgaWYgKGNvbnRlbnQgaW5zdGFuY2VvZiBCbGF6ZS5WaWV3KSB7XG4gICAgcmV0dXJuIGNvbnRlbnQ7XG4gIH0gZWxzZSB7XG4gICAgdmFyIGZ1bmMgPSBjb250ZW50O1xuICAgIGlmICh0eXBlb2YgZnVuYyAhPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgZnVuYyA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIGNvbnRlbnQ7XG4gICAgICB9O1xuICAgIH1cbiAgICByZXR1cm4gQmxhemUuVmlldygncmVuZGVyJywgZnVuYyk7XG4gIH1cbn07XG5cbi8vIEZvciBCbGF6ZS5yZW5kZXJXaXRoRGF0YSBhbmQgQmxhemUudG9IVE1MV2l0aERhdGEsIHdyYXAgY29udGVudFxuLy8gaW4gYSBmdW5jdGlvbiwgaWYgbmVjZXNzYXJ5LCBzbyBpdCBjYW4gYmUgYSBjb250ZW50IGFyZyB0b1xuLy8gYSBCbGF6ZS5XaXRoLlxudmFyIGNvbnRlbnRBc0Z1bmMgPSBmdW5jdGlvbiAoY29udGVudCkge1xuICBjaGVja1JlbmRlckNvbnRlbnQoY29udGVudCk7XG5cbiAgaWYgKHR5cGVvZiBjb250ZW50ICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcbiAgICAgIHJldHVybiBjb250ZW50O1xuICAgIH07XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIGNvbnRlbnQ7XG4gIH1cbn07XG5cbkJsYXplLl9fcm9vdFZpZXdzID0gW107XG5cbi8qKlxuICogQHN1bW1hcnkgUmVuZGVycyBhIHRlbXBsYXRlIG9yIFZpZXcgdG8gRE9NIG5vZGVzIGFuZCBpbnNlcnRzIGl0IGludG8gdGhlIERPTSwgcmV0dXJuaW5nIGEgcmVuZGVyZWQgW1ZpZXddKCNCbGF6ZS1WaWV3KSB3aGljaCBjYW4gYmUgcGFzc2VkIHRvIFtgQmxhemUucmVtb3ZlYF0oI0JsYXplLXJlbW92ZSkuXG4gKiBAbG9jdXMgQ2xpZW50XG4gKiBAcGFyYW0ge1RlbXBsYXRlfEJsYXplLlZpZXd9IHRlbXBsYXRlT3JWaWV3IFRoZSB0ZW1wbGF0ZSAoZS5nLiBgVGVtcGxhdGUubXlUZW1wbGF0ZWApIG9yIFZpZXcgb2JqZWN0IHRvIHJlbmRlci4gIElmIGEgdGVtcGxhdGUsIGEgVmlldyBvYmplY3QgaXMgW2NvbnN0cnVjdGVkXSgjdGVtcGxhdGVfY29uc3RydWN0dmlldykuICBJZiBhIFZpZXcsIGl0IG11c3QgYmUgYW4gdW5yZW5kZXJlZCBWaWV3LCB3aGljaCBiZWNvbWVzIGEgcmVuZGVyZWQgVmlldyBhbmQgaXMgcmV0dXJuZWQuXG4gKiBAcGFyYW0ge0RPTU5vZGV9IHBhcmVudE5vZGUgVGhlIG5vZGUgdGhhdCB3aWxsIGJlIHRoZSBwYXJlbnQgb2YgdGhlIHJlbmRlcmVkIHRlbXBsYXRlLiAgSXQgbXVzdCBiZSBhbiBFbGVtZW50IG5vZGUuXG4gKiBAcGFyYW0ge0RPTU5vZGV9IFtuZXh0Tm9kZV0gT3B0aW9uYWwuIElmIHByb3ZpZGVkLCBtdXN0IGJlIGEgY2hpbGQgb2YgPGVtPnBhcmVudE5vZGU8L2VtPjsgdGhlIHRlbXBsYXRlIHdpbGwgYmUgaW5zZXJ0ZWQgYmVmb3JlIHRoaXMgbm9kZS4gSWYgbm90IHByb3ZpZGVkLCB0aGUgdGVtcGxhdGUgd2lsbCBiZSBpbnNlcnRlZCBhcyB0aGUgbGFzdCBjaGlsZCBvZiBwYXJlbnROb2RlLlxuICogQHBhcmFtIHtCbGF6ZS5WaWV3fSBbcGFyZW50Vmlld10gT3B0aW9uYWwuIElmIHByb3ZpZGVkLCBpdCB3aWxsIGJlIHNldCBhcyB0aGUgcmVuZGVyZWQgVmlldydzIFtgcGFyZW50Vmlld2BdKCN2aWV3X3BhcmVudHZpZXcpLlxuICovXG5CbGF6ZS5yZW5kZXIgPSBmdW5jdGlvbiAoY29udGVudCwgcGFyZW50RWxlbWVudCwgbmV4dE5vZGUsIHBhcmVudFZpZXcpIHtcbiAgaWYgKCEgcGFyZW50RWxlbWVudCkge1xuICAgIEJsYXplLl93YXJuKFwiQmxhemUucmVuZGVyIHdpdGhvdXQgYSBwYXJlbnQgZWxlbWVudCBpcyBkZXByZWNhdGVkLiBcIiArXG4gICAgICAgICAgICAgICAgXCJZb3UgbXVzdCBzcGVjaWZ5IHdoZXJlIHRvIGluc2VydCB0aGUgcmVuZGVyZWQgY29udGVudC5cIik7XG4gIH1cblxuICBpZiAobmV4dE5vZGUgaW5zdGFuY2VvZiBCbGF6ZS5WaWV3KSB7XG4gICAgLy8gaGFuZGxlIG9taXR0ZWQgbmV4dE5vZGVcbiAgICBwYXJlbnRWaWV3ID0gbmV4dE5vZGU7XG4gICAgbmV4dE5vZGUgPSBudWxsO1xuICB9XG5cbiAgLy8gcGFyZW50RWxlbWVudCBtdXN0IGJlIGEgRE9NIG5vZGUuIGluIHBhcnRpY3VsYXIsIGNhbid0IGJlIHRoZVxuICAvLyByZXN1bHQgb2YgYSBjYWxsIHRvIGAkYC4gQ2FuJ3QgY2hlY2sgaWYgYHBhcmVudEVsZW1lbnQgaW5zdGFuY2VvZlxuICAvLyBOb2RlYCBzaW5jZSAnTm9kZScgaXMgdW5kZWZpbmVkIGluIElFOC5cbiAgaWYgKHBhcmVudEVsZW1lbnQgJiYgdHlwZW9mIHBhcmVudEVsZW1lbnQubm9kZVR5cGUgIT09ICdudW1iZXInKVxuICAgIHRocm93IG5ldyBFcnJvcihcIidwYXJlbnRFbGVtZW50JyBtdXN0IGJlIGEgRE9NIG5vZGVcIik7XG4gIGlmIChuZXh0Tm9kZSAmJiB0eXBlb2YgbmV4dE5vZGUubm9kZVR5cGUgIT09ICdudW1iZXInKSAvLyAnbmV4dE5vZGUnIGlzIG9wdGlvbmFsXG4gICAgdGhyb3cgbmV3IEVycm9yKFwiJ25leHROb2RlJyBtdXN0IGJlIGEgRE9NIG5vZGVcIik7XG5cbiAgcGFyZW50VmlldyA9IHBhcmVudFZpZXcgfHwgY3VycmVudFZpZXdJZlJlbmRlcmluZygpO1xuXG4gIHZhciB2aWV3ID0gY29udGVudEFzVmlldyhjb250ZW50KTtcblxuICAvLyBUT0RPOiB0aGlzIGlzIG9ubHkgbmVlZGVkIGluIGRldmVsb3BtZW50XG4gIGlmICghcGFyZW50Vmlldykge1xuICAgIHZpZXcub25WaWV3Q3JlYXRlZChmdW5jdGlvbiAoKSB7XG4gICAgICBCbGF6ZS5fX3Jvb3RWaWV3cy5wdXNoKHZpZXcpO1xuICAgIH0pO1xuXG4gICAgdmlldy5vblZpZXdEZXN0cm95ZWQoZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIGluZGV4ID0gQmxhemUuX19yb290Vmlld3MuaW5kZXhPZih2aWV3KTtcbiAgICAgIGlmIChpbmRleCA+IC0xKSB7XG4gICAgICAgIEJsYXplLl9fcm9vdFZpZXdzLnNwbGljZShpbmRleCwgMSk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICBCbGF6ZS5fbWF0ZXJpYWxpemVWaWV3KHZpZXcsIHBhcmVudFZpZXcpO1xuICBpZiAocGFyZW50RWxlbWVudCkge1xuICAgIHZpZXcuX2RvbXJhbmdlLmF0dGFjaChwYXJlbnRFbGVtZW50LCBuZXh0Tm9kZSk7XG4gIH1cblxuICByZXR1cm4gdmlldztcbn07XG5cbkJsYXplLmluc2VydCA9IGZ1bmN0aW9uICh2aWV3LCBwYXJlbnRFbGVtZW50LCBuZXh0Tm9kZSkge1xuICBCbGF6ZS5fd2FybihcIkJsYXplLmluc2VydCBoYXMgYmVlbiBkZXByZWNhdGVkLiAgU3BlY2lmeSB3aGVyZSB0byBpbnNlcnQgdGhlIFwiICtcbiAgICAgICAgICAgICAgXCJyZW5kZXJlZCBjb250ZW50IGluIHRoZSBjYWxsIHRvIEJsYXplLnJlbmRlci5cIik7XG5cbiAgaWYgKCEgKHZpZXcgJiYgKHZpZXcuX2RvbXJhbmdlIGluc3RhbmNlb2YgQmxhemUuX0RPTVJhbmdlKSkpXG4gICAgdGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0ZWQgdGVtcGxhdGUgcmVuZGVyZWQgd2l0aCBCbGF6ZS5yZW5kZXJcIik7XG5cbiAgdmlldy5fZG9tcmFuZ2UuYXR0YWNoKHBhcmVudEVsZW1lbnQsIG5leHROb2RlKTtcbn07XG5cbi8qKlxuICogQHN1bW1hcnkgUmVuZGVycyBhIHRlbXBsYXRlIG9yIFZpZXcgdG8gRE9NIG5vZGVzIHdpdGggYSBkYXRhIGNvbnRleHQuICBPdGhlcndpc2UgaWRlbnRpY2FsIHRvIGBCbGF6ZS5yZW5kZXJgLlxuICogQGxvY3VzIENsaWVudFxuICogQHBhcmFtIHtUZW1wbGF0ZXxCbGF6ZS5WaWV3fSB0ZW1wbGF0ZU9yVmlldyBUaGUgdGVtcGxhdGUgKGUuZy4gYFRlbXBsYXRlLm15VGVtcGxhdGVgKSBvciBWaWV3IG9iamVjdCB0byByZW5kZXIuXG4gKiBAcGFyYW0ge09iamVjdHxGdW5jdGlvbn0gZGF0YSBUaGUgZGF0YSBjb250ZXh0IHRvIHVzZSwgb3IgYSBmdW5jdGlvbiByZXR1cm5pbmcgYSBkYXRhIGNvbnRleHQuICBJZiBhIGZ1bmN0aW9uIGlzIHByb3ZpZGVkLCBpdCB3aWxsIGJlIHJlYWN0aXZlbHkgcmUtcnVuLlxuICogQHBhcmFtIHtET01Ob2RlfSBwYXJlbnROb2RlIFRoZSBub2RlIHRoYXQgd2lsbCBiZSB0aGUgcGFyZW50IG9mIHRoZSByZW5kZXJlZCB0ZW1wbGF0ZS4gIEl0IG11c3QgYmUgYW4gRWxlbWVudCBub2RlLlxuICogQHBhcmFtIHtET01Ob2RlfSBbbmV4dE5vZGVdIE9wdGlvbmFsLiBJZiBwcm92aWRlZCwgbXVzdCBiZSBhIGNoaWxkIG9mIDxlbT5wYXJlbnROb2RlPC9lbT47IHRoZSB0ZW1wbGF0ZSB3aWxsIGJlIGluc2VydGVkIGJlZm9yZSB0aGlzIG5vZGUuIElmIG5vdCBwcm92aWRlZCwgdGhlIHRlbXBsYXRlIHdpbGwgYmUgaW5zZXJ0ZWQgYXMgdGhlIGxhc3QgY2hpbGQgb2YgcGFyZW50Tm9kZS5cbiAqIEBwYXJhbSB7QmxhemUuVmlld30gW3BhcmVudFZpZXddIE9wdGlvbmFsLiBJZiBwcm92aWRlZCwgaXQgd2lsbCBiZSBzZXQgYXMgdGhlIHJlbmRlcmVkIFZpZXcncyBbYHBhcmVudFZpZXdgXSgjdmlld19wYXJlbnR2aWV3KS5cbiAqL1xuQmxhemUucmVuZGVyV2l0aERhdGEgPSBmdW5jdGlvbiAoY29udGVudCwgZGF0YSwgcGFyZW50RWxlbWVudCwgbmV4dE5vZGUsIHBhcmVudFZpZXcpIHtcbiAgLy8gV2UgZGVmZXIgdGhlIGhhbmRsaW5nIG9mIG9wdGlvbmFsIGFyZ3VtZW50cyB0byBCbGF6ZS5yZW5kZXIuICBBdCB0aGlzIHBvaW50LFxuICAvLyBgbmV4dE5vZGVgIG1heSBhY3R1YWxseSBiZSBgcGFyZW50Vmlld2AuXG4gIHJldHVybiBCbGF6ZS5yZW5kZXIoQmxhemUuX1RlbXBsYXRlV2l0aChkYXRhLCBjb250ZW50QXNGdW5jKGNvbnRlbnQpKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgcGFyZW50RWxlbWVudCwgbmV4dE5vZGUsIHBhcmVudFZpZXcpO1xufTtcblxuLyoqXG4gKiBAc3VtbWFyeSBSZW1vdmVzIGEgcmVuZGVyZWQgVmlldyBmcm9tIHRoZSBET00sIHN0b3BwaW5nIGFsbCByZWFjdGl2ZSB1cGRhdGVzIGFuZCBldmVudCBsaXN0ZW5lcnMgb24gaXQuIEFsc28gZGVzdHJveXMgdGhlIEJsYXplLlRlbXBsYXRlIGluc3RhbmNlIGFzc29jaWF0ZWQgd2l0aCB0aGUgdmlldy5cbiAqIEBsb2N1cyBDbGllbnRcbiAqIEBwYXJhbSB7QmxhemUuVmlld30gcmVuZGVyZWRWaWV3IFRoZSByZXR1cm4gdmFsdWUgZnJvbSBgQmxhemUucmVuZGVyYCBvciBgQmxhemUucmVuZGVyV2l0aERhdGFgLCBvciB0aGUgYHZpZXdgIHByb3BlcnR5IG9mIGEgQmxhemUuVGVtcGxhdGUgaW5zdGFuY2UuIENhbGxpbmcgYEJsYXplLnJlbW92ZShUZW1wbGF0ZS5pbnN0YW5jZSgpLnZpZXcpYCBmcm9tIHdpdGhpbiBhIHRlbXBsYXRlIGV2ZW50IGhhbmRsZXIgd2lsbCBkZXN0cm95IHRoZSB2aWV3IGFzIHdlbGwgYXMgdGhhdCB0ZW1wbGF0ZSBhbmQgdHJpZ2dlciB0aGUgdGVtcGxhdGUncyBgb25EZXN0cm95ZWRgIGhhbmRsZXJzLlxuICovXG5CbGF6ZS5yZW1vdmUgPSBmdW5jdGlvbiAodmlldykge1xuICBpZiAoISAodmlldyAmJiAodmlldy5fZG9tcmFuZ2UgaW5zdGFuY2VvZiBCbGF6ZS5fRE9NUmFuZ2UpKSlcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3RlZCB0ZW1wbGF0ZSByZW5kZXJlZCB3aXRoIEJsYXplLnJlbmRlclwiKTtcblxuICB3aGlsZSAodmlldykge1xuICAgIGlmICghIHZpZXcuaXNEZXN0cm95ZWQpIHtcbiAgICAgIHZhciByYW5nZSA9IHZpZXcuX2RvbXJhbmdlO1xuICAgICAgcmFuZ2UuZGVzdHJveSgpO1xuXG4gICAgICBpZiAocmFuZ2UuYXR0YWNoZWQgJiYgISByYW5nZS5wYXJlbnRSYW5nZSkge1xuICAgICAgICByYW5nZS5kZXRhY2goKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICB2aWV3ID0gdmlldy5faGFzR2VuZXJhdGVkUGFyZW50ICYmIHZpZXcucGFyZW50VmlldztcbiAgfVxufTtcblxuLyoqXG4gKiBAc3VtbWFyeSBSZW5kZXJzIGEgdGVtcGxhdGUgb3IgVmlldyB0byBhIHN0cmluZyBvZiBIVE1MLlxuICogQGxvY3VzIENsaWVudFxuICogQHBhcmFtIHtUZW1wbGF0ZXxCbGF6ZS5WaWV3fSB0ZW1wbGF0ZU9yVmlldyBUaGUgdGVtcGxhdGUgKGUuZy4gYFRlbXBsYXRlLm15VGVtcGxhdGVgKSBvciBWaWV3IG9iamVjdCBmcm9tIHdoaWNoIHRvIGdlbmVyYXRlIEhUTUwuXG4gKi9cbkJsYXplLnRvSFRNTCA9IGZ1bmN0aW9uIChjb250ZW50LCBwYXJlbnRWaWV3KSB7XG4gIHBhcmVudFZpZXcgPSBwYXJlbnRWaWV3IHx8IGN1cnJlbnRWaWV3SWZSZW5kZXJpbmcoKTtcblxuICByZXR1cm4gSFRNTC50b0hUTUwoQmxhemUuX2V4cGFuZFZpZXcoY29udGVudEFzVmlldyhjb250ZW50KSwgcGFyZW50VmlldykpO1xufTtcblxuLyoqXG4gKiBAc3VtbWFyeSBSZW5kZXJzIGEgdGVtcGxhdGUgb3IgVmlldyB0byBIVE1MIHdpdGggYSBkYXRhIGNvbnRleHQuICBPdGhlcndpc2UgaWRlbnRpY2FsIHRvIGBCbGF6ZS50b0hUTUxgLlxuICogQGxvY3VzIENsaWVudFxuICogQHBhcmFtIHtUZW1wbGF0ZXxCbGF6ZS5WaWV3fSB0ZW1wbGF0ZU9yVmlldyBUaGUgdGVtcGxhdGUgKGUuZy4gYFRlbXBsYXRlLm15VGVtcGxhdGVgKSBvciBWaWV3IG9iamVjdCBmcm9tIHdoaWNoIHRvIGdlbmVyYXRlIEhUTUwuXG4gKiBAcGFyYW0ge09iamVjdHxGdW5jdGlvbn0gZGF0YSBUaGUgZGF0YSBjb250ZXh0IHRvIHVzZSwgb3IgYSBmdW5jdGlvbiByZXR1cm5pbmcgYSBkYXRhIGNvbnRleHQuXG4gKi9cbkJsYXplLnRvSFRNTFdpdGhEYXRhID0gZnVuY3Rpb24gKGNvbnRlbnQsIGRhdGEsIHBhcmVudFZpZXcpIHtcbiAgcGFyZW50VmlldyA9IHBhcmVudFZpZXcgfHwgY3VycmVudFZpZXdJZlJlbmRlcmluZygpO1xuXG4gIHJldHVybiBIVE1MLnRvSFRNTChCbGF6ZS5fZXhwYW5kVmlldyhCbGF6ZS5fVGVtcGxhdGVXaXRoKFxuICAgIGRhdGEsIGNvbnRlbnRBc0Z1bmMoY29udGVudCkpLCBwYXJlbnRWaWV3KSk7XG59O1xuXG5CbGF6ZS5fdG9UZXh0ID0gZnVuY3Rpb24gKGh0bWxqcywgcGFyZW50VmlldywgdGV4dE1vZGUpIHtcbiAgaWYgKHR5cGVvZiBodG1sanMgPT09ICdmdW5jdGlvbicpXG4gICAgdGhyb3cgbmV3IEVycm9yKFwiQmxhemUuX3RvVGV4dCBkb2Vzbid0IHRha2UgYSBmdW5jdGlvbiwganVzdCBIVE1ManNcIik7XG5cbiAgaWYgKChwYXJlbnRWaWV3ICE9IG51bGwpICYmICEgKHBhcmVudFZpZXcgaW5zdGFuY2VvZiBCbGF6ZS5WaWV3KSkge1xuICAgIC8vIG9taXR0ZWQgcGFyZW50VmlldyBhcmd1bWVudFxuICAgIHRleHRNb2RlID0gcGFyZW50VmlldztcbiAgICBwYXJlbnRWaWV3ID0gbnVsbDtcbiAgfVxuICBwYXJlbnRWaWV3ID0gcGFyZW50VmlldyB8fCBjdXJyZW50Vmlld0lmUmVuZGVyaW5nKCk7XG5cbiAgaWYgKCEgdGV4dE1vZGUpXG4gICAgdGhyb3cgbmV3IEVycm9yKFwidGV4dE1vZGUgcmVxdWlyZWRcIik7XG4gIGlmICghICh0ZXh0TW9kZSA9PT0gSFRNTC5URVhUTU9ERS5TVFJJTkcgfHxcbiAgICAgICAgIHRleHRNb2RlID09PSBIVE1MLlRFWFRNT0RFLlJDREFUQSB8fFxuICAgICAgICAgdGV4dE1vZGUgPT09IEhUTUwuVEVYVE1PREUuQVRUUklCVVRFKSlcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJVbmtub3duIHRleHRNb2RlOiBcIiArIHRleHRNb2RlKTtcblxuICByZXR1cm4gSFRNTC50b1RleHQoQmxhemUuX2V4cGFuZChodG1sanMsIHBhcmVudFZpZXcpLCB0ZXh0TW9kZSk7XG59O1xuXG4vKipcbiAqIEBzdW1tYXJ5IFJldHVybnMgdGhlIGN1cnJlbnQgZGF0YSBjb250ZXh0LCBvciB0aGUgZGF0YSBjb250ZXh0IHRoYXQgd2FzIHVzZWQgd2hlbiByZW5kZXJpbmcgYSBwYXJ0aWN1bGFyIERPTSBlbGVtZW50IG9yIFZpZXcgZnJvbSBhIE1ldGVvciB0ZW1wbGF0ZS5cbiAqIEBsb2N1cyBDbGllbnRcbiAqIEBwYXJhbSB7RE9NRWxlbWVudHxCbGF6ZS5WaWV3fSBbZWxlbWVudE9yVmlld10gT3B0aW9uYWwuICBBbiBlbGVtZW50IHRoYXQgd2FzIHJlbmRlcmVkIGJ5IGEgTWV0ZW9yLCBvciBhIFZpZXcuXG4gKi9cbkJsYXplLmdldERhdGEgPSBmdW5jdGlvbiAoZWxlbWVudE9yVmlldykge1xuICB2YXIgdGhlV2l0aDtcblxuICBpZiAoISBlbGVtZW50T3JWaWV3KSB7XG4gICAgdGhlV2l0aCA9IEJsYXplLmdldFZpZXcoJ3dpdGgnKTtcbiAgfSBlbHNlIGlmIChlbGVtZW50T3JWaWV3IGluc3RhbmNlb2YgQmxhemUuVmlldykge1xuICAgIHZhciB2aWV3ID0gZWxlbWVudE9yVmlldztcbiAgICB0aGVXaXRoID0gKHZpZXcubmFtZSA9PT0gJ3dpdGgnID8gdmlldyA6XG4gICAgICAgICAgICAgICBCbGF6ZS5nZXRWaWV3KHZpZXcsICd3aXRoJykpO1xuICB9IGVsc2UgaWYgKHR5cGVvZiBlbGVtZW50T3JWaWV3Lm5vZGVUeXBlID09PSAnbnVtYmVyJykge1xuICAgIGlmIChlbGVtZW50T3JWaWV3Lm5vZGVUeXBlICE9PSAxKVxuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0ZWQgRE9NIGVsZW1lbnRcIik7XG4gICAgdGhlV2l0aCA9IEJsYXplLmdldFZpZXcoZWxlbWVudE9yVmlldywgJ3dpdGgnKTtcbiAgfSBlbHNlIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3RlZCBET00gZWxlbWVudCBvciBWaWV3XCIpO1xuICB9XG5cbiAgcmV0dXJuIHRoZVdpdGggPyB0aGVXaXRoLmRhdGFWYXIuZ2V0KCkgOiBudWxsO1xufTtcblxuLy8gRm9yIGJhY2stY29tcGF0XG5CbGF6ZS5nZXRFbGVtZW50RGF0YSA9IGZ1bmN0aW9uIChlbGVtZW50KSB7XG4gIEJsYXplLl93YXJuKFwiQmxhemUuZ2V0RWxlbWVudERhdGEgaGFzIGJlZW4gZGVwcmVjYXRlZC4gIFVzZSBcIiArXG4gICAgICAgICAgICAgIFwiQmxhemUuZ2V0RGF0YShlbGVtZW50KSBpbnN0ZWFkLlwiKTtcblxuICBpZiAoZWxlbWVudC5ub2RlVHlwZSAhPT0gMSlcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3RlZCBET00gZWxlbWVudFwiKTtcblxuICByZXR1cm4gQmxhemUuZ2V0RGF0YShlbGVtZW50KTtcbn07XG5cbi8vIEJvdGggYXJndW1lbnRzIGFyZSBvcHRpb25hbC5cblxuLyoqXG4gKiBAc3VtbWFyeSBHZXRzIGVpdGhlciB0aGUgY3VycmVudCBWaWV3LCBvciB0aGUgVmlldyBlbmNsb3NpbmcgdGhlIGdpdmVuIERPTSBlbGVtZW50LlxuICogQGxvY3VzIENsaWVudFxuICogQHBhcmFtIHtET01FbGVtZW50fSBbZWxlbWVudF0gT3B0aW9uYWwuICBJZiBzcGVjaWZpZWQsIHRoZSBWaWV3IGVuY2xvc2luZyBgZWxlbWVudGAgaXMgcmV0dXJuZWQuXG4gKi9cbkJsYXplLmdldFZpZXcgPSBmdW5jdGlvbiAoZWxlbWVudE9yVmlldywgX3ZpZXdOYW1lKSB7XG4gIHZhciB2aWV3TmFtZSA9IF92aWV3TmFtZTtcblxuICBpZiAoKHR5cGVvZiBlbGVtZW50T3JWaWV3KSA9PT0gJ3N0cmluZycpIHtcbiAgICAvLyBvbWl0dGVkIGVsZW1lbnRPclZpZXc7IHZpZXdOYW1lIHByZXNlbnRcbiAgICB2aWV3TmFtZSA9IGVsZW1lbnRPclZpZXc7XG4gICAgZWxlbWVudE9yVmlldyA9IG51bGw7XG4gIH1cblxuICAvLyBXZSBjb3VsZCBldmVudHVhbGx5IHNob3J0ZW4gdGhlIGNvZGUgYnkgZm9sZGluZyB0aGUgbG9naWNcbiAgLy8gZnJvbSB0aGUgb3RoZXIgbWV0aG9kcyBpbnRvIHRoaXMgbWV0aG9kLlxuICBpZiAoISBlbGVtZW50T3JWaWV3KSB7XG4gICAgcmV0dXJuIEJsYXplLl9nZXRDdXJyZW50Vmlldyh2aWV3TmFtZSk7XG4gIH0gZWxzZSBpZiAoZWxlbWVudE9yVmlldyBpbnN0YW5jZW9mIEJsYXplLlZpZXcpIHtcbiAgICByZXR1cm4gQmxhemUuX2dldFBhcmVudFZpZXcoZWxlbWVudE9yVmlldywgdmlld05hbWUpO1xuICB9IGVsc2UgaWYgKHR5cGVvZiBlbGVtZW50T3JWaWV3Lm5vZGVUeXBlID09PSAnbnVtYmVyJykge1xuICAgIHJldHVybiBCbGF6ZS5fZ2V0RWxlbWVudFZpZXcoZWxlbWVudE9yVmlldywgdmlld05hbWUpO1xuICB9IGVsc2Uge1xuICAgIHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGVkIERPTSBlbGVtZW50IG9yIFZpZXdcIik7XG4gIH1cbn07XG5cbi8vIEdldHMgdGhlIGN1cnJlbnQgdmlldyBvciBpdHMgbmVhcmVzdCBhbmNlc3RvciBvZiBuYW1lXG4vLyBgbmFtZWAuXG5CbGF6ZS5fZ2V0Q3VycmVudFZpZXcgPSBmdW5jdGlvbiAobmFtZSkge1xuICB2YXIgdmlldyA9IEJsYXplLmN1cnJlbnRWaWV3O1xuICAvLyBCZXR0ZXIgdG8gZmFpbCBpbiBjYXNlcyB3aGVyZSBpdCBkb2Vzbid0IG1ha2Ugc2Vuc2VcbiAgLy8gdG8gdXNlIEJsYXplLl9nZXRDdXJyZW50VmlldygpLiAgVGhlcmUgd2lsbCBiZSBhIGN1cnJlbnRcbiAgLy8gdmlldyBhbnl3aGVyZSBpdCBkb2VzLiAgWW91IGNhbiBjaGVjayBCbGF6ZS5jdXJyZW50Vmlld1xuICAvLyBpZiB5b3Ugd2FudCB0byBrbm93IHdoZXRoZXIgdGhlcmUgaXMgb25lIG9yIG5vdC5cbiAgaWYgKCEgdmlldylcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJUaGVyZSBpcyBubyBjdXJyZW50IHZpZXdcIik7XG5cbiAgaWYgKG5hbWUpIHtcbiAgICB3aGlsZSAodmlldyAmJiB2aWV3Lm5hbWUgIT09IG5hbWUpXG4gICAgICB2aWV3ID0gdmlldy5wYXJlbnRWaWV3O1xuICAgIHJldHVybiB2aWV3IHx8IG51bGw7XG4gIH0gZWxzZSB7XG4gICAgLy8gQmxhemUuX2dldEN1cnJlbnRWaWV3KCkgd2l0aCBubyBhcmd1bWVudHMganVzdCByZXR1cm5zXG4gICAgLy8gQmxhemUuY3VycmVudFZpZXcuXG4gICAgcmV0dXJuIHZpZXc7XG4gIH1cbn07XG5cbkJsYXplLl9nZXRQYXJlbnRWaWV3ID0gZnVuY3Rpb24gKHZpZXcsIG5hbWUpIHtcbiAgdmFyIHYgPSB2aWV3LnBhcmVudFZpZXc7XG5cbiAgaWYgKG5hbWUpIHtcbiAgICB3aGlsZSAodiAmJiB2Lm5hbWUgIT09IG5hbWUpXG4gICAgICB2ID0gdi5wYXJlbnRWaWV3O1xuICB9XG5cbiAgcmV0dXJuIHYgfHwgbnVsbDtcbn07XG5cbkJsYXplLl9nZXRFbGVtZW50VmlldyA9IGZ1bmN0aW9uIChlbGVtLCBuYW1lKSB7XG4gIHZhciByYW5nZSA9IEJsYXplLl9ET01SYW5nZS5mb3JFbGVtZW50KGVsZW0pO1xuICB2YXIgdmlldyA9IG51bGw7XG4gIHdoaWxlIChyYW5nZSAmJiAhIHZpZXcpIHtcbiAgICB2aWV3ID0gKHJhbmdlLnZpZXcgfHwgbnVsbCk7XG4gICAgaWYgKCEgdmlldykge1xuICAgICAgaWYgKHJhbmdlLnBhcmVudFJhbmdlKVxuICAgICAgICByYW5nZSA9IHJhbmdlLnBhcmVudFJhbmdlO1xuICAgICAgZWxzZVxuICAgICAgICByYW5nZSA9IEJsYXplLl9ET01SYW5nZS5mb3JFbGVtZW50KHJhbmdlLnBhcmVudEVsZW1lbnQpO1xuICAgIH1cbiAgfVxuXG4gIGlmIChuYW1lKSB7XG4gICAgd2hpbGUgKHZpZXcgJiYgdmlldy5uYW1lICE9PSBuYW1lKVxuICAgICAgdmlldyA9IHZpZXcucGFyZW50VmlldztcbiAgICByZXR1cm4gdmlldyB8fCBudWxsO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiB2aWV3O1xuICB9XG59O1xuXG5CbGF6ZS5fYWRkRXZlbnRNYXAgPSBmdW5jdGlvbiAodmlldywgZXZlbnRNYXAsIHRoaXNJbkhhbmRsZXIpIHtcbiAgdGhpc0luSGFuZGxlciA9ICh0aGlzSW5IYW5kbGVyIHx8IG51bGwpO1xuICB2YXIgaGFuZGxlcyA9IFtdO1xuXG4gIGlmICghIHZpZXcuX2RvbXJhbmdlKVxuICAgIHRocm93IG5ldyBFcnJvcihcIlZpZXcgbXVzdCBoYXZlIGEgRE9NUmFuZ2VcIik7XG5cbiAgdmlldy5fZG9tcmFuZ2Uub25BdHRhY2hlZChmdW5jdGlvbiBhdHRhY2hlZF9ldmVudE1hcHMocmFuZ2UsIGVsZW1lbnQpIHtcbiAgICBPYmplY3Qua2V5cyhldmVudE1hcCkuZm9yRWFjaChmdW5jdGlvbiAoc3BlYykge1xuICAgICAgbGV0IGhhbmRsZXIgPSBldmVudE1hcFtzcGVjXTtcbiAgICAgIHZhciBjbGF1c2VzID0gc3BlYy5zcGxpdCgvLFxccysvKTtcbiAgICAgIC8vIGl0ZXJhdGUgb3ZlciBjbGF1c2VzIG9mIHNwZWMsIGUuZy4gWydjbGljayAuZm9vJywgJ2NsaWNrIC5iYXInXVxuICAgICAgY2xhdXNlcy5mb3JFYWNoKGZ1bmN0aW9uIChjbGF1c2UpIHtcbiAgICAgICAgdmFyIHBhcnRzID0gY2xhdXNlLnNwbGl0KC9cXHMrLyk7XG4gICAgICAgIGlmIChwYXJ0cy5sZW5ndGggPT09IDApXG4gICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIHZhciBuZXdFdmVudHMgPSBwYXJ0cy5zaGlmdCgpO1xuICAgICAgICB2YXIgc2VsZWN0b3IgPSBwYXJ0cy5qb2luKCcgJyk7XG4gICAgICAgIGhhbmRsZXMucHVzaChCbGF6ZS5fRXZlbnRTdXBwb3J0Lmxpc3RlbihcbiAgICAgICAgICBlbGVtZW50LCBuZXdFdmVudHMsIHNlbGVjdG9yLFxuICAgICAgICAgIGZ1bmN0aW9uIChldnQpIHtcbiAgICAgICAgICAgIGlmICghIHJhbmdlLmNvbnRhaW5zRWxlbWVudChldnQuY3VycmVudFRhcmdldCwgc2VsZWN0b3IsIG5ld0V2ZW50cykpXG4gICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgdmFyIGhhbmRsZXJUaGlzID0gdGhpc0luSGFuZGxlciB8fCB0aGlzO1xuICAgICAgICAgICAgdmFyIGhhbmRsZXJBcmdzID0gYXJndW1lbnRzO1xuICAgICAgICAgICAgcmV0dXJuIEJsYXplLl93aXRoQ3VycmVudFZpZXcodmlldywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICByZXR1cm4gaGFuZGxlci5hcHBseShoYW5kbGVyVGhpcywgaGFuZGxlckFyZ3MpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfSxcbiAgICAgICAgICByYW5nZSwgZnVuY3Rpb24gKHIpIHtcbiAgICAgICAgICAgIHJldHVybiByLnBhcmVudFJhbmdlO1xuICAgICAgICAgIH0pKTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9KTtcblxuICB2aWV3Lm9uVmlld0Rlc3Ryb3llZChmdW5jdGlvbiAoKSB7XG4gICAgaGFuZGxlcy5mb3JFYWNoKGZ1bmN0aW9uIChoKSB7XG4gICAgICBoLnN0b3AoKTtcbiAgICB9KTtcbiAgICBoYW5kbGVzLmxlbmd0aCA9IDA7XG4gIH0pO1xufTtcbiIsImltcG9ydCBoYXMgZnJvbSAnbG9kYXNoLmhhcyc7XG5pbXBvcnQgaXNPYmplY3QgZnJvbSAnbG9kYXNoLmlzb2JqZWN0JztcblxuQmxhemUuX2NhbGN1bGF0ZUNvbmRpdGlvbiA9IGZ1bmN0aW9uIChjb25kKSB7XG4gIGlmIChIVE1MLmlzQXJyYXkoY29uZCkgJiYgY29uZC5sZW5ndGggPT09IDApXG4gICAgY29uZCA9IGZhbHNlO1xuICByZXR1cm4gISEgY29uZDtcbn07XG5cbi8qKlxuICogQHN1bW1hcnkgQ29uc3RydWN0cyBhIFZpZXcgdGhhdCByZW5kZXJzIGNvbnRlbnQgd2l0aCBhIGRhdGEgY29udGV4dC5cbiAqIEBsb2N1cyBDbGllbnRcbiAqIEBwYXJhbSB7T2JqZWN0fEZ1bmN0aW9ufSBkYXRhIEFuIG9iamVjdCB0byB1c2UgYXMgdGhlIGRhdGEgY29udGV4dCwgb3IgYSBmdW5jdGlvbiByZXR1cm5pbmcgc3VjaCBhbiBvYmplY3QuICBJZiBhIGZ1bmN0aW9uIGlzIHByb3ZpZGVkLCBpdCB3aWxsIGJlIHJlYWN0aXZlbHkgcmUtcnVuLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gY29udGVudEZ1bmMgQSBGdW5jdGlvbiB0aGF0IHJldHVybnMgWypyZW5kZXJhYmxlIGNvbnRlbnQqXSgjUmVuZGVyYWJsZS1Db250ZW50KS5cbiAqL1xuQmxhemUuV2l0aCA9IGZ1bmN0aW9uIChkYXRhLCBjb250ZW50RnVuYykge1xuICB2YXIgdmlldyA9IEJsYXplLlZpZXcoJ3dpdGgnLCBjb250ZW50RnVuYyk7XG5cbiAgdmlldy5kYXRhVmFyID0gbmV3IFJlYWN0aXZlVmFyO1xuXG4gIHZpZXcub25WaWV3Q3JlYXRlZChmdW5jdGlvbiAoKSB7XG4gICAgaWYgKHR5cGVvZiBkYXRhID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAvLyBgZGF0YWAgaXMgYSByZWFjdGl2ZSBmdW5jdGlvblxuICAgICAgdmlldy5hdXRvcnVuKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmlldy5kYXRhVmFyLnNldChkYXRhKCkpO1xuICAgICAgfSwgdmlldy5wYXJlbnRWaWV3LCAnc2V0RGF0YScpO1xuICAgIH0gZWxzZSB7XG4gICAgICB2aWV3LmRhdGFWYXIuc2V0KGRhdGEpO1xuICAgIH1cbiAgfSk7XG5cbiAgcmV0dXJuIHZpZXc7XG59O1xuXG4vKipcbiAqIEF0dGFjaGVzIGJpbmRpbmdzIHRvIHRoZSBpbnN0YW50aWF0ZWQgdmlldy5cbiAqIEBwYXJhbSB7T2JqZWN0fSBiaW5kaW5ncyBBIGRpY3Rpb25hcnkgb2YgYmluZGluZ3MsIGVhY2ggYmluZGluZyBuYW1lXG4gKiBjb3JyZXNwb25kcyB0byBhIHZhbHVlIG9yIGEgZnVuY3Rpb24gdGhhdCB3aWxsIGJlIHJlYWN0aXZlbHkgcmUtcnVuLlxuICogQHBhcmFtIHtWaWV3fSB2aWV3IFRoZSB0YXJnZXQuXG4gKi9cbkJsYXplLl9hdHRhY2hCaW5kaW5nc1RvVmlldyA9IGZ1bmN0aW9uIChiaW5kaW5ncywgdmlldykge1xuICB2aWV3Lm9uVmlld0NyZWF0ZWQoZnVuY3Rpb24gKCkge1xuICAgIE9iamVjdC5lbnRyaWVzKGJpbmRpbmdzKS5mb3JFYWNoKGZ1bmN0aW9uIChbbmFtZSwgYmluZGluZ10pIHtcbiAgICAgIHZpZXcuX3Njb3BlQmluZGluZ3NbbmFtZV0gPSBuZXcgUmVhY3RpdmVWYXIoKTtcbiAgICAgIGlmICh0eXBlb2YgYmluZGluZyA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICB2aWV3LmF1dG9ydW4oZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHZpZXcuX3Njb3BlQmluZGluZ3NbbmFtZV0uc2V0KGJpbmRpbmcoKSk7XG4gICAgICAgIH0sIHZpZXcucGFyZW50Vmlldyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB2aWV3Ll9zY29wZUJpbmRpbmdzW25hbWVdLnNldChiaW5kaW5nKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfSk7XG59O1xuXG4vKipcbiAqIEBzdW1tYXJ5IENvbnN0cnVjdHMgYSBWaWV3IHNldHRpbmcgdGhlIGxvY2FsIGxleGljYWwgc2NvcGUgaW4gdGhlIGJsb2NrLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gYmluZGluZ3MgRGljdGlvbmFyeSBtYXBwaW5nIG5hbWVzIG9mIGJpbmRpbmdzIHRvXG4gKiB2YWx1ZXMgb3IgY29tcHV0YXRpb25zIHRvIHJlYWN0aXZlbHkgcmUtcnVuLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gY29udGVudEZ1bmMgQSBGdW5jdGlvbiB0aGF0IHJldHVybnMgWypyZW5kZXJhYmxlIGNvbnRlbnQqXSgjUmVuZGVyYWJsZS1Db250ZW50KS5cbiAqL1xuQmxhemUuTGV0ID0gZnVuY3Rpb24gKGJpbmRpbmdzLCBjb250ZW50RnVuYykge1xuICB2YXIgdmlldyA9IEJsYXplLlZpZXcoJ2xldCcsIGNvbnRlbnRGdW5jKTtcbiAgQmxhemUuX2F0dGFjaEJpbmRpbmdzVG9WaWV3KGJpbmRpbmdzLCB2aWV3KTtcblxuICByZXR1cm4gdmlldztcbn07XG5cbi8qKlxuICogQHN1bW1hcnkgQ29uc3RydWN0cyBhIFZpZXcgdGhhdCByZW5kZXJzIGNvbnRlbnQgY29uZGl0aW9uYWxseS5cbiAqIEBsb2N1cyBDbGllbnRcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGNvbmRpdGlvbkZ1bmMgQSBmdW5jdGlvbiB0byByZWFjdGl2ZWx5IHJlLXJ1bi4gIFdoZXRoZXIgdGhlIHJlc3VsdCBpcyB0cnV0aHkgb3IgZmFsc3kgZGV0ZXJtaW5lcyB3aGV0aGVyIGBjb250ZW50RnVuY2Agb3IgYGVsc2VGdW5jYCBpcyBzaG93bi4gIEFuIGVtcHR5IGFycmF5IGlzIGNvbnNpZGVyZWQgZmFsc3kuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBjb250ZW50RnVuYyBBIEZ1bmN0aW9uIHRoYXQgcmV0dXJucyBbKnJlbmRlcmFibGUgY29udGVudCpdKCNSZW5kZXJhYmxlLUNvbnRlbnQpLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gW2Vsc2VGdW5jXSBPcHRpb25hbC4gIEEgRnVuY3Rpb24gdGhhdCByZXR1cm5zIFsqcmVuZGVyYWJsZSBjb250ZW50Kl0oI1JlbmRlcmFibGUtQ29udGVudCkuICBJZiBubyBgZWxzZUZ1bmNgIGlzIHN1cHBsaWVkLCBubyBjb250ZW50IGlzIHNob3duIGluIHRoZSBcImVsc2VcIiBjYXNlLlxuICovXG5CbGF6ZS5JZiA9IGZ1bmN0aW9uIChjb25kaXRpb25GdW5jLCBjb250ZW50RnVuYywgZWxzZUZ1bmMsIF9ub3QpIHtcbiAgdmFyIGNvbmRpdGlvblZhciA9IG5ldyBSZWFjdGl2ZVZhcjtcblxuICB2YXIgdmlldyA9IEJsYXplLlZpZXcoX25vdCA/ICd1bmxlc3MnIDogJ2lmJywgZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiBjb25kaXRpb25WYXIuZ2V0KCkgPyBjb250ZW50RnVuYygpIDpcbiAgICAgIChlbHNlRnVuYyA/IGVsc2VGdW5jKCkgOiBudWxsKTtcbiAgfSk7XG4gIHZpZXcuX19jb25kaXRpb25WYXIgPSBjb25kaXRpb25WYXI7XG4gIHZpZXcub25WaWV3Q3JlYXRlZChmdW5jdGlvbiAoKSB7XG4gICAgdGhpcy5hdXRvcnVuKGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhciBjb25kID0gQmxhemUuX2NhbGN1bGF0ZUNvbmRpdGlvbihjb25kaXRpb25GdW5jKCkpO1xuICAgICAgY29uZGl0aW9uVmFyLnNldChfbm90ID8gKCEgY29uZCkgOiBjb25kKTtcbiAgICB9LCB0aGlzLnBhcmVudFZpZXcsICdjb25kaXRpb24nKTtcbiAgfSk7XG5cbiAgcmV0dXJuIHZpZXc7XG59O1xuXG4vKipcbiAqIEBzdW1tYXJ5IEFuIGludmVydGVkIFtgQmxhemUuSWZgXSgjQmxhemUtSWYpLlxuICogQGxvY3VzIENsaWVudFxuICogQHBhcmFtIHtGdW5jdGlvbn0gY29uZGl0aW9uRnVuYyBBIGZ1bmN0aW9uIHRvIHJlYWN0aXZlbHkgcmUtcnVuLiAgSWYgdGhlIHJlc3VsdCBpcyBmYWxzeSwgYGNvbnRlbnRGdW5jYCBpcyBzaG93biwgb3RoZXJ3aXNlIGBlbHNlRnVuY2AgaXMgc2hvd24uICBBbiBlbXB0eSBhcnJheSBpcyBjb25zaWRlcmVkIGZhbHN5LlxuICogQHBhcmFtIHtGdW5jdGlvbn0gY29udGVudEZ1bmMgQSBGdW5jdGlvbiB0aGF0IHJldHVybnMgWypyZW5kZXJhYmxlIGNvbnRlbnQqXSgjUmVuZGVyYWJsZS1Db250ZW50KS5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IFtlbHNlRnVuY10gT3B0aW9uYWwuICBBIEZ1bmN0aW9uIHRoYXQgcmV0dXJucyBbKnJlbmRlcmFibGUgY29udGVudCpdKCNSZW5kZXJhYmxlLUNvbnRlbnQpLiAgSWYgbm8gYGVsc2VGdW5jYCBpcyBzdXBwbGllZCwgbm8gY29udGVudCBpcyBzaG93biBpbiB0aGUgXCJlbHNlXCIgY2FzZS5cbiAqL1xuQmxhemUuVW5sZXNzID0gZnVuY3Rpb24gKGNvbmRpdGlvbkZ1bmMsIGNvbnRlbnRGdW5jLCBlbHNlRnVuYykge1xuICByZXR1cm4gQmxhemUuSWYoY29uZGl0aW9uRnVuYywgY29udGVudEZ1bmMsIGVsc2VGdW5jLCB0cnVlIC8qX25vdCovKTtcbn07XG5cbi8qKlxuICogQHN1bW1hcnkgQ29uc3RydWN0cyBhIFZpZXcgdGhhdCByZW5kZXJzIGBjb250ZW50RnVuY2AgZm9yIGVhY2ggaXRlbSBpbiBhIHNlcXVlbmNlLlxuICogQGxvY3VzIENsaWVudFxuICogQHBhcmFtIHtGdW5jdGlvbn0gYXJnRnVuYyBBIGZ1bmN0aW9uIHRvIHJlYWN0aXZlbHkgcmUtcnVuLiBUaGUgZnVuY3Rpb24gY2FuXG4gKiByZXR1cm4gb25lIG9mIHR3byBvcHRpb25zOlxuICpcbiAqIDEuIEFuIG9iamVjdCB3aXRoIHR3byBmaWVsZHM6ICdfdmFyaWFibGUnIGFuZCAnX3NlcXVlbmNlJy4gRWFjaCBpdGVyYXRlcyBvdmVyXG4gKiAgICdfc2VxdWVuY2UnLCBpdCBtYXkgYmUgYSBDdXJzb3IsIGFuIGFycmF5LCBudWxsLCBvciB1bmRlZmluZWQuIEluc2lkZSB0aGVcbiAqICAgRWFjaCBib2R5IHlvdSB3aWxsIGJlIGFibGUgdG8gZ2V0IHRoZSBjdXJyZW50IGl0ZW0gZnJvbSB0aGUgc2VxdWVuY2UgdXNpbmdcbiAqICAgdGhlIG5hbWUgc3BlY2lmaWVkIGluIHRoZSAnX3ZhcmlhYmxlJyBmaWVsZC5cbiAqXG4gKiAyLiBKdXN0IGEgc2VxdWVuY2UgKEN1cnNvciwgYXJyYXksIG51bGwsIG9yIHVuZGVmaW5lZCkgbm90IHdyYXBwZWQgaW50byBhblxuICogICBvYmplY3QuIEluc2lkZSB0aGUgRWFjaCBib2R5LCB0aGUgY3VycmVudCBpdGVtIHdpbGwgYmUgc2V0IGFzIHRoZSBkYXRhXG4gKiAgIGNvbnRleHQuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBjb250ZW50RnVuYyBBIEZ1bmN0aW9uIHRoYXQgcmV0dXJucyAgWypyZW5kZXJhYmxlXG4gKiBjb250ZW50Kl0oI1JlbmRlcmFibGUtQ29udGVudCkuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBbZWxzZUZ1bmNdIEEgRnVuY3Rpb24gdGhhdCByZXR1cm5zIFsqcmVuZGVyYWJsZVxuICogY29udGVudCpdKCNSZW5kZXJhYmxlLUNvbnRlbnQpIHRvIGRpc3BsYXkgaW4gdGhlIGNhc2Ugd2hlbiB0aGVyZSBhcmUgbm8gaXRlbXNcbiAqIGluIHRoZSBzZXF1ZW5jZS5cbiAqL1xuQmxhemUuRWFjaCA9IGZ1bmN0aW9uIChhcmdGdW5jLCBjb250ZW50RnVuYywgZWxzZUZ1bmMpIHtcbiAgdmFyIGVhY2hWaWV3ID0gQmxhemUuVmlldygnZWFjaCcsIGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgc3Vidmlld3MgPSB0aGlzLmluaXRpYWxTdWJ2aWV3cztcbiAgICB0aGlzLmluaXRpYWxTdWJ2aWV3cyA9IG51bGw7XG4gICAgaWYgKHRoaXMuX2lzQ3JlYXRlZEZvckV4cGFuc2lvbikge1xuICAgICAgdGhpcy5leHBhbmRlZFZhbHVlRGVwID0gbmV3IFRyYWNrZXIuRGVwZW5kZW5jeTtcbiAgICAgIHRoaXMuZXhwYW5kZWRWYWx1ZURlcC5kZXBlbmQoKTtcbiAgICB9XG4gICAgcmV0dXJuIHN1YnZpZXdzO1xuICB9KTtcbiAgZWFjaFZpZXcuaW5pdGlhbFN1YnZpZXdzID0gW107XG4gIGVhY2hWaWV3Lm51bUl0ZW1zID0gMDtcbiAgZWFjaFZpZXcuaW5FbHNlTW9kZSA9IGZhbHNlO1xuICBlYWNoVmlldy5zdG9wSGFuZGxlID0gbnVsbDtcbiAgZWFjaFZpZXcuY29udGVudEZ1bmMgPSBjb250ZW50RnVuYztcbiAgZWFjaFZpZXcuZWxzZUZ1bmMgPSBlbHNlRnVuYztcbiAgZWFjaFZpZXcuYXJnVmFyID0gbmV3IFJlYWN0aXZlVmFyO1xuICBlYWNoVmlldy52YXJpYWJsZU5hbWUgPSBudWxsO1xuXG4gIC8vIHVwZGF0ZSB0aGUgQGluZGV4IHZhbHVlIGluIHRoZSBzY29wZSBvZiBhbGwgc3Vidmlld3MgaW4gdGhlIHJhbmdlXG4gIHZhciB1cGRhdGVJbmRpY2VzID0gZnVuY3Rpb24gKGZyb20sIHRvKSB7XG4gICAgaWYgKHRvID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHRvID0gZWFjaFZpZXcubnVtSXRlbXMgLSAxO1xuICAgIH1cblxuICAgIGZvciAodmFyIGkgPSBmcm9tOyBpIDw9IHRvOyBpKyspIHtcbiAgICAgIHZhciB2aWV3ID0gZWFjaFZpZXcuX2RvbXJhbmdlLm1lbWJlcnNbaV0udmlldztcbiAgICAgIHZpZXcuX3Njb3BlQmluZGluZ3NbJ0BpbmRleCddLnNldChpKTtcbiAgICB9XG4gIH07XG5cbiAgZWFjaFZpZXcub25WaWV3Q3JlYXRlZChmdW5jdGlvbiAoKSB7XG4gICAgLy8gV2UgZXZhbHVhdGUgYXJnRnVuYyBpbiBhbiBhdXRvcnVuIHRvIG1ha2Ugc3VyZVxuICAgIC8vIEJsYXplLmN1cnJlbnRWaWV3IGlzIGFsd2F5cyBzZXQgd2hlbiBpdCBydW5zIChyYXRoZXIgdGhhblxuICAgIC8vIHBhc3NpbmcgYXJnRnVuYyBzdHJhaWdodCB0byBPYnNlcnZlU2VxdWVuY2UpLlxuICAgIGVhY2hWaWV3LmF1dG9ydW4oZnVuY3Rpb24gKCkge1xuICAgICAgLy8gYXJnRnVuYyBjYW4gcmV0dXJuIGVpdGhlciBhIHNlcXVlbmNlIGFzIGlzIG9yIGEgd3JhcHBlciBvYmplY3Qgd2l0aCBhXG4gICAgICAvLyBfc2VxdWVuY2UgYW5kIF92YXJpYWJsZSBmaWVsZHMgc2V0LlxuICAgICAgdmFyIGFyZyA9IGFyZ0Z1bmMoKTtcbiAgICAgIGlmIChpc09iamVjdChhcmcpICYmIGhhcyhhcmcsICdfc2VxdWVuY2UnKSkge1xuICAgICAgICBlYWNoVmlldy52YXJpYWJsZU5hbWUgPSBhcmcuX3ZhcmlhYmxlIHx8IG51bGw7XG4gICAgICAgIGFyZyA9IGFyZy5fc2VxdWVuY2U7XG4gICAgICB9XG5cbiAgICAgIGVhY2hWaWV3LmFyZ1Zhci5zZXQoYXJnKTtcbiAgICB9LCBlYWNoVmlldy5wYXJlbnRWaWV3LCAnY29sbGVjdGlvbicpO1xuXG4gICAgZWFjaFZpZXcuc3RvcEhhbmRsZSA9IE9ic2VydmVTZXF1ZW5jZS5vYnNlcnZlKGZ1bmN0aW9uICgpIHtcbiAgICAgIHJldHVybiBlYWNoVmlldy5hcmdWYXIuZ2V0KCk7XG4gICAgfSwge1xuICAgICAgYWRkZWRBdDogZnVuY3Rpb24gKGlkLCBpdGVtLCBpbmRleCkge1xuICAgICAgICBUcmFja2VyLm5vbnJlYWN0aXZlKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICB2YXIgbmV3SXRlbVZpZXc7XG4gICAgICAgICAgaWYgKGVhY2hWaWV3LnZhcmlhYmxlTmFtZSkge1xuICAgICAgICAgICAgLy8gbmV3LXN0eWxlICNlYWNoIChhcyBpbiB7eyNlYWNoIGl0ZW0gaW4gaXRlbXN9fSlcbiAgICAgICAgICAgIC8vIGRvZXNuJ3QgY3JlYXRlIGEgbmV3IGRhdGEgY29udGV4dFxuICAgICAgICAgICAgbmV3SXRlbVZpZXcgPSBCbGF6ZS5WaWV3KCdpdGVtJywgZWFjaFZpZXcuY29udGVudEZ1bmMpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBuZXdJdGVtVmlldyA9IEJsYXplLldpdGgoaXRlbSwgZWFjaFZpZXcuY29udGVudEZ1bmMpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGVhY2hWaWV3Lm51bUl0ZW1zKys7XG5cbiAgICAgICAgICB2YXIgYmluZGluZ3MgPSB7fTtcbiAgICAgICAgICBiaW5kaW5nc1snQGluZGV4J10gPSBpbmRleDtcbiAgICAgICAgICBpZiAoZWFjaFZpZXcudmFyaWFibGVOYW1lKSB7XG4gICAgICAgICAgICBiaW5kaW5nc1tlYWNoVmlldy52YXJpYWJsZU5hbWVdID0gaXRlbTtcbiAgICAgICAgICB9XG4gICAgICAgICAgQmxhemUuX2F0dGFjaEJpbmRpbmdzVG9WaWV3KGJpbmRpbmdzLCBuZXdJdGVtVmlldyk7XG5cbiAgICAgICAgICBpZiAoZWFjaFZpZXcuZXhwYW5kZWRWYWx1ZURlcCkge1xuICAgICAgICAgICAgZWFjaFZpZXcuZXhwYW5kZWRWYWx1ZURlcC5jaGFuZ2VkKCk7XG4gICAgICAgICAgfSBlbHNlIGlmIChlYWNoVmlldy5fZG9tcmFuZ2UpIHtcbiAgICAgICAgICAgIGlmIChlYWNoVmlldy5pbkVsc2VNb2RlKSB7XG4gICAgICAgICAgICAgIGVhY2hWaWV3Ll9kb21yYW5nZS5yZW1vdmVNZW1iZXIoMCk7XG4gICAgICAgICAgICAgIGVhY2hWaWV3LmluRWxzZU1vZGUgPSBmYWxzZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIHJhbmdlID0gQmxhemUuX21hdGVyaWFsaXplVmlldyhuZXdJdGVtVmlldywgZWFjaFZpZXcpO1xuICAgICAgICAgICAgZWFjaFZpZXcuX2RvbXJhbmdlLmFkZE1lbWJlcihyYW5nZSwgaW5kZXgpO1xuICAgICAgICAgICAgdXBkYXRlSW5kaWNlcyhpbmRleCk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGVhY2hWaWV3LmluaXRpYWxTdWJ2aWV3cy5zcGxpY2UoaW5kZXgsIDAsIG5ld0l0ZW1WaWV3KTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgfSxcbiAgICAgIHJlbW92ZWRBdDogZnVuY3Rpb24gKGlkLCBpdGVtLCBpbmRleCkge1xuICAgICAgICBUcmFja2VyLm5vbnJlYWN0aXZlKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBlYWNoVmlldy5udW1JdGVtcy0tO1xuICAgICAgICAgIGlmIChlYWNoVmlldy5leHBhbmRlZFZhbHVlRGVwKSB7XG4gICAgICAgICAgICBlYWNoVmlldy5leHBhbmRlZFZhbHVlRGVwLmNoYW5nZWQoKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKGVhY2hWaWV3Ll9kb21yYW5nZSkge1xuICAgICAgICAgICAgZWFjaFZpZXcuX2RvbXJhbmdlLnJlbW92ZU1lbWJlcihpbmRleCk7XG4gICAgICAgICAgICB1cGRhdGVJbmRpY2VzKGluZGV4KTtcbiAgICAgICAgICAgIGlmIChlYWNoVmlldy5lbHNlRnVuYyAmJiBlYWNoVmlldy5udW1JdGVtcyA9PT0gMCkge1xuICAgICAgICAgICAgICBlYWNoVmlldy5pbkVsc2VNb2RlID0gdHJ1ZTtcbiAgICAgICAgICAgICAgZWFjaFZpZXcuX2RvbXJhbmdlLmFkZE1lbWJlcihcbiAgICAgICAgICAgICAgICBCbGF6ZS5fbWF0ZXJpYWxpemVWaWV3KFxuICAgICAgICAgICAgICAgICAgQmxhemUuVmlldygnZWFjaF9lbHNlJyxlYWNoVmlldy5lbHNlRnVuYyksXG4gICAgICAgICAgICAgICAgICBlYWNoVmlldyksIDApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBlYWNoVmlldy5pbml0aWFsU3Vidmlld3Muc3BsaWNlKGluZGV4LCAxKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgfSxcbiAgICAgIGNoYW5nZWRBdDogZnVuY3Rpb24gKGlkLCBuZXdJdGVtLCBvbGRJdGVtLCBpbmRleCkge1xuICAgICAgICBUcmFja2VyLm5vbnJlYWN0aXZlKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBpZiAoZWFjaFZpZXcuZXhwYW5kZWRWYWx1ZURlcCkge1xuICAgICAgICAgICAgZWFjaFZpZXcuZXhwYW5kZWRWYWx1ZURlcC5jaGFuZ2VkKCk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhciBpdGVtVmlldztcbiAgICAgICAgICAgIGlmIChlYWNoVmlldy5fZG9tcmFuZ2UpIHtcbiAgICAgICAgICAgICAgaXRlbVZpZXcgPSBlYWNoVmlldy5fZG9tcmFuZ2UuZ2V0TWVtYmVyKGluZGV4KS52aWV3O1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgaXRlbVZpZXcgPSBlYWNoVmlldy5pbml0aWFsU3Vidmlld3NbaW5kZXhdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGVhY2hWaWV3LnZhcmlhYmxlTmFtZSkge1xuICAgICAgICAgICAgICBpdGVtVmlldy5fc2NvcGVCaW5kaW5nc1tlYWNoVmlldy52YXJpYWJsZU5hbWVdLnNldChuZXdJdGVtKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGl0ZW1WaWV3LmRhdGFWYXIuc2V0KG5ld0l0ZW0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICB9LFxuICAgICAgbW92ZWRUbzogZnVuY3Rpb24gKGlkLCBpdGVtLCBmcm9tSW5kZXgsIHRvSW5kZXgpIHtcbiAgICAgICAgVHJhY2tlci5ub25yZWFjdGl2ZShmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgaWYgKGVhY2hWaWV3LmV4cGFuZGVkVmFsdWVEZXApIHtcbiAgICAgICAgICAgIGVhY2hWaWV3LmV4cGFuZGVkVmFsdWVEZXAuY2hhbmdlZCgpO1xuICAgICAgICAgIH0gZWxzZSBpZiAoZWFjaFZpZXcuX2RvbXJhbmdlKSB7XG4gICAgICAgICAgICBlYWNoVmlldy5fZG9tcmFuZ2UubW92ZU1lbWJlcihmcm9tSW5kZXgsIHRvSW5kZXgpO1xuICAgICAgICAgICAgdXBkYXRlSW5kaWNlcyhcbiAgICAgICAgICAgICAgTWF0aC5taW4oZnJvbUluZGV4LCB0b0luZGV4KSwgTWF0aC5tYXgoZnJvbUluZGV4LCB0b0luZGV4KSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhciBzdWJ2aWV3cyA9IGVhY2hWaWV3LmluaXRpYWxTdWJ2aWV3cztcbiAgICAgICAgICAgIHZhciBpdGVtVmlldyA9IHN1YnZpZXdzW2Zyb21JbmRleF07XG4gICAgICAgICAgICBzdWJ2aWV3cy5zcGxpY2UoZnJvbUluZGV4LCAxKTtcbiAgICAgICAgICAgIHN1YnZpZXdzLnNwbGljZSh0b0luZGV4LCAwLCBpdGVtVmlldyk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGlmIChlYWNoVmlldy5lbHNlRnVuYyAmJiBlYWNoVmlldy5udW1JdGVtcyA9PT0gMCkge1xuICAgICAgZWFjaFZpZXcuaW5FbHNlTW9kZSA9IHRydWU7XG4gICAgICBlYWNoVmlldy5pbml0aWFsU3Vidmlld3NbMF0gPVxuICAgICAgICBCbGF6ZS5WaWV3KCdlYWNoX2Vsc2UnLCBlYWNoVmlldy5lbHNlRnVuYyk7XG4gICAgfVxuICB9KTtcblxuICBlYWNoVmlldy5vblZpZXdEZXN0cm95ZWQoZnVuY3Rpb24gKCkge1xuICAgIGlmIChlYWNoVmlldy5zdG9wSGFuZGxlKVxuICAgICAgZWFjaFZpZXcuc3RvcEhhbmRsZS5zdG9wKCk7XG4gIH0pO1xuXG4gIHJldHVybiBlYWNoVmlldztcbn07XG5cbkJsYXplLl9UZW1wbGF0ZVdpdGggPSBmdW5jdGlvbiAoYXJnLCBjb250ZW50RnVuYykge1xuICB2YXIgdztcblxuICB2YXIgYXJnRnVuYyA9IGFyZztcbiAgaWYgKHR5cGVvZiBhcmcgIT09ICdmdW5jdGlvbicpIHtcbiAgICBhcmdGdW5jID0gZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIGFyZztcbiAgICB9O1xuICB9XG5cbiAgLy8gVGhpcyBpcyBhIGxpdHRsZSBtZXNzeS4gIFdoZW4gd2UgY29tcGlsZSBge3s+IFRlbXBsYXRlLmNvbnRlbnRCbG9ja319YCwgd2VcbiAgLy8gd3JhcCBpdCBpbiBCbGF6ZS5fSW5PdXRlclRlbXBsYXRlU2NvcGUgaW4gb3JkZXIgdG8gc2tpcCB0aGUgaW50ZXJtZWRpYXRlXG4gIC8vIHBhcmVudCBWaWV3cyBpbiB0aGUgY3VycmVudCB0ZW1wbGF0ZS4gIEhvd2V2ZXIsIHdoZW4gdGhlcmUncyBhbiBhcmd1bWVudFxuICAvLyAoYHt7PiBUZW1wbGF0ZS5jb250ZW50QmxvY2sgYXJnfX1gKSwgdGhlIGFyZ3VtZW50IG5lZWRzIHRvIGJlIGV2YWx1YXRlZFxuICAvLyBpbiB0aGUgb3JpZ2luYWwgc2NvcGUuICBUaGVyZSdzIG5vIGdvb2Qgb3JkZXIgdG8gbmVzdFxuICAvLyBCbGF6ZS5fSW5PdXRlclRlbXBsYXRlU2NvcGUgYW5kIEJsYXplLl9UZW1wbGF0ZVdpdGggdG8gYWNoaWV2ZSB0aGlzLFxuICAvLyBzbyB3ZSB3cmFwIGFyZ0Z1bmMgdG8gcnVuIGl0IGluIHRoZSBcIm9yaWdpbmFsIHBhcmVudFZpZXdcIiBvZiB0aGVcbiAgLy8gQmxhemUuX0luT3V0ZXJUZW1wbGF0ZVNjb3BlLlxuICAvL1xuICAvLyBUbyBtYWtlIHRoaXMgYmV0dGVyLCByZWNvbnNpZGVyIF9Jbk91dGVyVGVtcGxhdGVTY29wZSBhcyBhIHByaW1pdGl2ZS5cbiAgLy8gTG9uZ2VyIHRlcm0sIGV2YWx1YXRlIGV4cHJlc3Npb25zIGluIHRoZSBwcm9wZXIgbGV4aWNhbCBzY29wZS5cbiAgdmFyIHdyYXBwZWRBcmdGdW5jID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciB2aWV3VG9FdmFsdWF0ZUFyZyA9IG51bGw7XG4gICAgaWYgKHcucGFyZW50VmlldyAmJiB3LnBhcmVudFZpZXcubmFtZSA9PT0gJ0luT3V0ZXJUZW1wbGF0ZVNjb3BlJykge1xuICAgICAgdmlld1RvRXZhbHVhdGVBcmcgPSB3LnBhcmVudFZpZXcub3JpZ2luYWxQYXJlbnRWaWV3O1xuICAgIH1cbiAgICBpZiAodmlld1RvRXZhbHVhdGVBcmcpIHtcbiAgICAgIHJldHVybiBCbGF6ZS5fd2l0aEN1cnJlbnRWaWV3KHZpZXdUb0V2YWx1YXRlQXJnLCBhcmdGdW5jKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIGFyZ0Z1bmMoKTtcbiAgICB9XG4gIH07XG5cbiAgdmFyIHdyYXBwZWRDb250ZW50RnVuYyA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgY29udGVudCA9IGNvbnRlbnRGdW5jLmNhbGwodGhpcyk7XG5cbiAgICAvLyBTaW5jZSB3ZSBhcmUgZ2VuZXJhdGluZyB0aGUgQmxhemUuX1RlbXBsYXRlV2l0aCB2aWV3IGZvciB0aGVcbiAgICAvLyB1c2VyLCBzZXQgdGhlIGZsYWcgb24gdGhlIGNoaWxkIHZpZXcuICBJZiBgY29udGVudGAgaXMgYSB0ZW1wbGF0ZSxcbiAgICAvLyBjb25zdHJ1Y3QgdGhlIFZpZXcgc28gdGhhdCB3ZSBjYW4gc2V0IHRoZSBmbGFnLlxuICAgIGlmIChjb250ZW50IGluc3RhbmNlb2YgQmxhemUuVGVtcGxhdGUpIHtcbiAgICAgIGNvbnRlbnQgPSBjb250ZW50LmNvbnN0cnVjdFZpZXcoKTtcbiAgICB9XG4gICAgaWYgKGNvbnRlbnQgaW5zdGFuY2VvZiBCbGF6ZS5WaWV3KSB7XG4gICAgICBjb250ZW50Ll9oYXNHZW5lcmF0ZWRQYXJlbnQgPSB0cnVlO1xuICAgIH1cblxuICAgIHJldHVybiBjb250ZW50O1xuICB9O1xuXG4gIHcgPSBCbGF6ZS5XaXRoKHdyYXBwZWRBcmdGdW5jLCB3cmFwcGVkQ29udGVudEZ1bmMpO1xuICB3Ll9faXNUZW1wbGF0ZVdpdGggPSB0cnVlO1xuICByZXR1cm4gdztcbn07XG5cbkJsYXplLl9Jbk91dGVyVGVtcGxhdGVTY29wZSA9IGZ1bmN0aW9uICh0ZW1wbGF0ZVZpZXcsIGNvbnRlbnRGdW5jKSB7XG4gIHZhciB2aWV3ID0gQmxhemUuVmlldygnSW5PdXRlclRlbXBsYXRlU2NvcGUnLCBjb250ZW50RnVuYyk7XG4gIHZhciBwYXJlbnRWaWV3ID0gdGVtcGxhdGVWaWV3LnBhcmVudFZpZXc7XG5cbiAgLy8gSGFjayBzbyB0aGF0IGlmIHlvdSBjYWxsIGB7ez4gZm9vIGJhcn19YCBhbmQgaXQgZXhwYW5kcyBpbnRvXG4gIC8vIGB7eyN3aXRoIGJhcn19e3s+IGZvb319e3svd2l0aH19YCwgYW5kIHRoZW4gYGZvb2AgaXMgYSB0ZW1wbGF0ZVxuICAvLyB0aGF0IGluc2VydHMgYHt7PiBUZW1wbGF0ZS5jb250ZW50QmxvY2t9fWAsIHRoZSBkYXRhIGNvbnRleHQgZm9yXG4gIC8vIGBUZW1wbGF0ZS5jb250ZW50QmxvY2tgIGlzIG5vdCBgYmFyYCBidXQgdGhlIG9uZSBlbmNsb3NpbmcgdGhhdC5cbiAgaWYgKHBhcmVudFZpZXcuX19pc1RlbXBsYXRlV2l0aClcbiAgICBwYXJlbnRWaWV3ID0gcGFyZW50Vmlldy5wYXJlbnRWaWV3O1xuXG4gIHZpZXcub25WaWV3Q3JlYXRlZChmdW5jdGlvbiAoKSB7XG4gICAgdGhpcy5vcmlnaW5hbFBhcmVudFZpZXcgPSB0aGlzLnBhcmVudFZpZXc7XG4gICAgdGhpcy5wYXJlbnRWaWV3ID0gcGFyZW50VmlldztcbiAgICB0aGlzLl9fY2hpbGREb2VzbnRTdGFydE5ld0xleGljYWxTY29wZSA9IHRydWU7XG4gIH0pO1xuICByZXR1cm4gdmlldztcbn07XG5cbiIsImltcG9ydCBoYXMgZnJvbSAnbG9kYXNoLmhhcyc7XG5cbkJsYXplLl9nbG9iYWxIZWxwZXJzID0ge307XG5cbi8vIERvY3VtZW50ZWQgYXMgVGVtcGxhdGUucmVnaXN0ZXJIZWxwZXIuXG4vLyBUaGlzIGRlZmluaXRpb24gYWxzbyBwcm92aWRlcyBiYWNrLWNvbXBhdCBmb3IgYFVJLnJlZ2lzdGVySGVscGVyYC5cbkJsYXplLnJlZ2lzdGVySGVscGVyID0gZnVuY3Rpb24gKG5hbWUsIGZ1bmMpIHtcbiAgQmxhemUuX2dsb2JhbEhlbHBlcnNbbmFtZV0gPSBmdW5jO1xufTtcblxuLy8gQWxzbyBkb2N1bWVudGVkIGFzIFRlbXBsYXRlLmRlcmVnaXN0ZXJIZWxwZXJcbkJsYXplLmRlcmVnaXN0ZXJIZWxwZXIgPSBmdW5jdGlvbihuYW1lKSB7XG4gIGRlbGV0ZSBCbGF6ZS5fZ2xvYmFsSGVscGVyc1tuYW1lXTtcbn07XG5cbnZhciBiaW5kSWZJc0Z1bmN0aW9uID0gZnVuY3Rpb24gKHgsIHRhcmdldCkge1xuICBpZiAodHlwZW9mIHggIT09ICdmdW5jdGlvbicpXG4gICAgcmV0dXJuIHg7XG4gIHJldHVybiBCbGF6ZS5fYmluZCh4LCB0YXJnZXQpO1xufTtcblxuLy8gSWYgYHhgIGlzIGEgZnVuY3Rpb24sIGJpbmRzIHRoZSB2YWx1ZSBvZiBgdGhpc2AgZm9yIHRoYXQgZnVuY3Rpb25cbi8vIHRvIHRoZSBjdXJyZW50IGRhdGEgY29udGV4dC5cbnZhciBiaW5kRGF0YUNvbnRleHQgPSBmdW5jdGlvbiAoeCkge1xuICBpZiAodHlwZW9mIHggPT09ICdmdW5jdGlvbicpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIGRhdGEgPSBCbGF6ZS5nZXREYXRhKCk7XG4gICAgICBpZiAoZGF0YSA9PSBudWxsKVxuICAgICAgICBkYXRhID0ge307XG4gICAgICByZXR1cm4geC5hcHBseShkYXRhLCBhcmd1bWVudHMpO1xuICAgIH07XG4gIH1cbiAgcmV0dXJuIHg7XG59O1xuXG5CbGF6ZS5fT0xEU1RZTEVfSEVMUEVSID0ge307XG5cbkJsYXplLl9nZXRUZW1wbGF0ZUhlbHBlciA9IGZ1bmN0aW9uICh0ZW1wbGF0ZSwgbmFtZSwgdG1wbEluc3RhbmNlRnVuYykge1xuICAvLyBYWFggQ09NUEFUIFdJVEggMC45LjNcbiAgdmFyIGlzS25vd25PbGRTdHlsZUhlbHBlciA9IGZhbHNlO1xuXG4gIGlmICh0ZW1wbGF0ZS5fX2hlbHBlcnMuaGFzKG5hbWUpKSB7XG4gICAgdmFyIGhlbHBlciA9IHRlbXBsYXRlLl9faGVscGVycy5nZXQobmFtZSk7XG4gICAgaWYgKGhlbHBlciA9PT0gQmxhemUuX09MRFNUWUxFX0hFTFBFUikge1xuICAgICAgaXNLbm93bk9sZFN0eWxlSGVscGVyID0gdHJ1ZTtcbiAgICB9IGVsc2UgaWYgKGhlbHBlciAhPSBudWxsKSB7XG4gICAgICByZXR1cm4gd3JhcEhlbHBlcihiaW5kRGF0YUNvbnRleHQoaGVscGVyKSwgdG1wbEluc3RhbmNlRnVuYyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgfVxuXG4gIC8vIG9sZC1zdHlsZSBoZWxwZXJcbiAgaWYgKG5hbWUgaW4gdGVtcGxhdGUpIHtcbiAgICAvLyBPbmx5IHdhcm4gb25jZSBwZXIgaGVscGVyXG4gICAgaWYgKCEgaXNLbm93bk9sZFN0eWxlSGVscGVyKSB7XG4gICAgICB0ZW1wbGF0ZS5fX2hlbHBlcnMuc2V0KG5hbWUsIEJsYXplLl9PTERTVFlMRV9IRUxQRVIpO1xuICAgICAgaWYgKCEgdGVtcGxhdGUuX05PV0FSTl9PTERTVFlMRV9IRUxQRVJTKSB7XG4gICAgICAgIEJsYXplLl93YXJuKCdBc3NpZ25pbmcgaGVscGVyIHdpdGggYCcgKyB0ZW1wbGF0ZS52aWV3TmFtZSArICcuJyArXG4gICAgICAgICAgICAgICAgICAgIG5hbWUgKyAnID0gLi4uYCBpcyBkZXByZWNhdGVkLiAgVXNlIGAnICsgdGVtcGxhdGUudmlld05hbWUgK1xuICAgICAgICAgICAgICAgICAgICAnLmhlbHBlcnMoLi4uKWAgaW5zdGVhZC4nKTtcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKHRlbXBsYXRlW25hbWVdICE9IG51bGwpIHtcbiAgICAgIHJldHVybiB3cmFwSGVscGVyKGJpbmREYXRhQ29udGV4dCh0ZW1wbGF0ZVtuYW1lXSksIHRtcGxJbnN0YW5jZUZ1bmMpO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBudWxsO1xufTtcblxudmFyIHdyYXBIZWxwZXIgPSBmdW5jdGlvbiAoZiwgdGVtcGxhdGVGdW5jKSB7XG4gIGlmICh0eXBlb2YgZiAhPT0gXCJmdW5jdGlvblwiKSB7XG4gICAgcmV0dXJuIGY7XG4gIH1cblxuICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICB2YXIgYXJncyA9IGFyZ3VtZW50cztcblxuICAgIHJldHVybiBCbGF6ZS5UZW1wbGF0ZS5fd2l0aFRlbXBsYXRlSW5zdGFuY2VGdW5jKHRlbXBsYXRlRnVuYywgZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIEJsYXplLl93cmFwQ2F0Y2hpbmdFeGNlcHRpb25zKGYsICd0ZW1wbGF0ZSBoZWxwZXInKS5hcHBseShzZWxmLCBhcmdzKTtcbiAgICB9KTtcbiAgfTtcbn07XG5cbmZ1bmN0aW9uIF9sZXhpY2FsS2VlcEdvaW5nKGN1cnJlbnRWaWV3KSB7XG4gIGlmICghY3VycmVudFZpZXcucGFyZW50Vmlldykge1xuICAgIHJldHVybiB1bmRlZmluZWQ7XG4gIH1cbiAgaWYgKCFjdXJyZW50Vmlldy5fX3N0YXJ0c05ld0xleGljYWxTY29wZSkge1xuICAgIHJldHVybiBjdXJyZW50Vmlldy5wYXJlbnRWaWV3O1xuICB9XG4gIGlmIChjdXJyZW50Vmlldy5wYXJlbnRWaWV3Ll9fY2hpbGREb2VzbnRTdGFydE5ld0xleGljYWxTY29wZSkge1xuICAgIHJldHVybiBjdXJyZW50Vmlldy5wYXJlbnRWaWV3O1xuICB9XG4gIFxuICAvLyBpbiB0aGUgY2FzZSBvZiB7ez4gVGVtcGxhdGUuY29udGVudEJsb2NrIGRhdGF9fSB0aGUgY29udGVudEJsb2NrIGxvc2VzIHRoZSBsZXhpY2FsIHNjb3BlIG9mIGl0J3MgcGFyZW50LCB3aGVyYXMge3s+IFRlbXBsYXRlLmNvbnRlbnRCbG9ja319IGl0IGRvZXMgbm90XG4gIC8vIHRoaXMgaXMgYmVjYXVzZSBhICN3aXRoIHNpdHMgYmV0d2VlbiB0aGUgaW5jbHVkZSBJbk91dGVyVGVtcGxhdGVTY29wZVxuICBpZiAoY3VycmVudFZpZXcucGFyZW50Vmlldy5uYW1lID09PSBcIndpdGhcIiAmJiBjdXJyZW50Vmlldy5wYXJlbnRWaWV3LnBhcmVudFZpZXcgJiYgY3VycmVudFZpZXcucGFyZW50Vmlldy5wYXJlbnRWaWV3Ll9fY2hpbGREb2VzbnRTdGFydE5ld0xleGljYWxTY29wZSkge1xuICAgIHJldHVybiBjdXJyZW50Vmlldy5wYXJlbnRWaWV3O1xuICB9XG4gIHJldHVybiB1bmRlZmluZWQ7XG59XG5cbkJsYXplLl9sZXhpY2FsQmluZGluZ0xvb2t1cCA9IGZ1bmN0aW9uICh2aWV3LCBuYW1lKSB7XG4gIHZhciBjdXJyZW50VmlldyA9IHZpZXc7XG4gIHZhciBibG9ja0hlbHBlcnNTdGFjayA9IFtdO1xuXG4gIC8vIHdhbGsgdXAgdGhlIHZpZXdzIHN0b3BwaW5nIGF0IGEgU3BhY2ViYXJzLmluY2x1ZGUgb3IgVGVtcGxhdGUgdmlldyB0aGF0XG4gIC8vIGRvZXNuJ3QgaGF2ZSBhbiBJbk91dGVyVGVtcGxhdGVTY29wZSB2aWV3IGFzIGEgcGFyZW50XG4gIGRvIHtcbiAgICAvLyBza2lwIGJsb2NrIGhlbHBlcnMgdmlld3NcbiAgICAvLyBpZiB3ZSBmb3VuZCB0aGUgYmluZGluZyBvbiB0aGUgc2NvcGUsIHJldHVybiBpdFxuICAgIGlmIChoYXMoY3VycmVudFZpZXcuX3Njb3BlQmluZGluZ3MsIG5hbWUpKSB7XG4gICAgICB2YXIgYmluZGluZ1JlYWN0aXZlVmFyID0gY3VycmVudFZpZXcuX3Njb3BlQmluZGluZ3NbbmFtZV07XG4gICAgICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gYmluZGluZ1JlYWN0aXZlVmFyLmdldCgpO1xuICAgICAgfTtcbiAgICB9XG4gIH0gd2hpbGUgKGN1cnJlbnRWaWV3ID0gX2xleGljYWxLZWVwR29pbmcoY3VycmVudFZpZXcpKTtcblxuICByZXR1cm4gbnVsbDtcbn07XG5cbi8vIHRlbXBsYXRlSW5zdGFuY2UgYXJndW1lbnQgaXMgcHJvdmlkZWQgdG8gYmUgYXZhaWxhYmxlIGZvciBwb3NzaWJsZVxuLy8gYWx0ZXJuYXRpdmUgaW1wbGVtZW50YXRpb25zIG9mIHRoaXMgZnVuY3Rpb24gYnkgM3JkIHBhcnR5IHBhY2thZ2VzLlxuQmxhemUuX2dldFRlbXBsYXRlID0gZnVuY3Rpb24gKG5hbWUsIHRlbXBsYXRlSW5zdGFuY2UpIHtcbiAgaWYgKChuYW1lIGluIEJsYXplLlRlbXBsYXRlKSAmJiAoQmxhemUuVGVtcGxhdGVbbmFtZV0gaW5zdGFuY2VvZiBCbGF6ZS5UZW1wbGF0ZSkpIHtcbiAgICByZXR1cm4gQmxhemUuVGVtcGxhdGVbbmFtZV07XG4gIH1cbiAgcmV0dXJuIG51bGw7XG59O1xuXG5CbGF6ZS5fZ2V0R2xvYmFsSGVscGVyID0gZnVuY3Rpb24gKG5hbWUsIHRlbXBsYXRlSW5zdGFuY2UpIHtcbiAgaWYgKEJsYXplLl9nbG9iYWxIZWxwZXJzW25hbWVdICE9IG51bGwpIHtcbiAgICByZXR1cm4gd3JhcEhlbHBlcihiaW5kRGF0YUNvbnRleHQoQmxhemUuX2dsb2JhbEhlbHBlcnNbbmFtZV0pLCB0ZW1wbGF0ZUluc3RhbmNlKTtcbiAgfVxuICByZXR1cm4gbnVsbDtcbn07XG5cbi8vIExvb2tzIHVwIGEgbmFtZSwgbGlrZSBcImZvb1wiIG9yIFwiLi5cIiwgYXMgYSBoZWxwZXIgb2YgdGhlXG4vLyBjdXJyZW50IHRlbXBsYXRlOyB0aGUgbmFtZSBvZiBhIHRlbXBsYXRlOyBhIGdsb2JhbCBoZWxwZXI7XG4vLyBvciBhIHByb3BlcnR5IG9mIHRoZSBkYXRhIGNvbnRleHQuICBDYWxsZWQgb24gdGhlIFZpZXcgb2Zcbi8vIGEgdGVtcGxhdGUgKGkuZS4gYSBWaWV3IHdpdGggYSBgLnRlbXBsYXRlYCBwcm9wZXJ0eSxcbi8vIHdoZXJlIHRoZSBoZWxwZXJzIGFyZSkuICBVc2VkIGZvciB0aGUgZmlyc3QgbmFtZSBpbiBhXG4vLyBcInBhdGhcIiBpbiBhIHRlbXBsYXRlIHRhZywgbGlrZSBcImZvb1wiIGluIGB7e2Zvby5iYXJ9fWAgb3Jcbi8vIFwiLi5cIiBpbiBge3tmcm9idWxhdGUgLi4vYmxhaH19YC5cbi8vXG4vLyBSZXR1cm5zIGEgZnVuY3Rpb24sIGEgbm9uLWZ1bmN0aW9uIHZhbHVlLCBvciBudWxsLiAgSWZcbi8vIGEgZnVuY3Rpb24gaXMgZm91bmQsIGl0IGlzIGJvdW5kIGFwcHJvcHJpYXRlbHkuXG4vL1xuLy8gTk9URTogVGhpcyBmdW5jdGlvbiBtdXN0IG5vdCBlc3RhYmxpc2ggYW55IHJlYWN0aXZlXG4vLyBkZXBlbmRlbmNpZXMgaXRzZWxmLiAgSWYgdGhlcmUgaXMgYW55IHJlYWN0aXZpdHkgaW4gdGhlXG4vLyB2YWx1ZSwgbG9va3VwIHNob3VsZCByZXR1cm4gYSBmdW5jdGlvbi5cbkJsYXplLlZpZXcucHJvdG90eXBlLmxvb2t1cCA9IGZ1bmN0aW9uIChuYW1lLCBfb3B0aW9ucykge1xuICB2YXIgdGVtcGxhdGUgPSB0aGlzLnRlbXBsYXRlO1xuICB2YXIgbG9va3VwVGVtcGxhdGUgPSBfb3B0aW9ucyAmJiBfb3B0aW9ucy50ZW1wbGF0ZTtcbiAgdmFyIGhlbHBlcjtcbiAgdmFyIGJpbmRpbmc7XG4gIHZhciBib3VuZFRtcGxJbnN0YW5jZTtcbiAgdmFyIGZvdW5kVGVtcGxhdGU7XG5cbiAgaWYgKHRoaXMudGVtcGxhdGVJbnN0YW5jZSkge1xuICAgIGJvdW5kVG1wbEluc3RhbmNlID0gQmxhemUuX2JpbmQodGhpcy50ZW1wbGF0ZUluc3RhbmNlLCB0aGlzKTtcbiAgfVxuXG4gIC8vIDAuIGxvb2tpbmcgdXAgdGhlIHBhcmVudCBkYXRhIGNvbnRleHQgd2l0aCB0aGUgc3BlY2lhbCBcIi4uL1wiIHN5bnRheFxuICBpZiAoL15cXC4vLnRlc3QobmFtZSkpIHtcbiAgICAvLyBzdGFydHMgd2l0aCBhIGRvdC4gbXVzdCBiZSBhIHNlcmllcyBvZiBkb3RzIHdoaWNoIG1hcHMgdG8gYW5cbiAgICAvLyBhbmNlc3RvciBvZiB0aGUgYXBwcm9wcmlhdGUgaGVpZ2h0LlxuICAgIGlmICghL14oXFwuKSskLy50ZXN0KG5hbWUpKVxuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiaWQgc3RhcnRpbmcgd2l0aCBkb3QgbXVzdCBiZSBhIHNlcmllcyBvZiBkb3RzXCIpO1xuXG4gICAgcmV0dXJuIEJsYXplLl9wYXJlbnREYXRhKG5hbWUubGVuZ3RoIC0gMSwgdHJ1ZSAvKl9mdW5jdGlvbldyYXBwZWQqLyk7XG5cbiAgfVxuXG4gIC8vIDEuIGxvb2sgdXAgYSBoZWxwZXIgb24gdGhlIGN1cnJlbnQgdGVtcGxhdGVcbiAgaWYgKHRlbXBsYXRlICYmICgoaGVscGVyID0gQmxhemUuX2dldFRlbXBsYXRlSGVscGVyKHRlbXBsYXRlLCBuYW1lLCBib3VuZFRtcGxJbnN0YW5jZSkpICE9IG51bGwpKSB7XG4gICAgcmV0dXJuIGhlbHBlcjtcbiAgfVxuXG4gIC8vIDIuIGxvb2sgdXAgYSBiaW5kaW5nIGJ5IHRyYXZlcnNpbmcgdGhlIGxleGljYWwgdmlldyBoaWVyYXJjaHkgaW5zaWRlIHRoZVxuICAvLyBjdXJyZW50IHRlbXBsYXRlXG4gIGlmICh0ZW1wbGF0ZSAmJiAoYmluZGluZyA9IEJsYXplLl9sZXhpY2FsQmluZGluZ0xvb2t1cChCbGF6ZS5jdXJyZW50VmlldywgbmFtZSkpICE9IG51bGwpIHtcbiAgICByZXR1cm4gYmluZGluZztcbiAgfVxuXG4gIC8vIDMuIGxvb2sgdXAgYSB0ZW1wbGF0ZSBieSBuYW1lXG4gIGlmIChsb29rdXBUZW1wbGF0ZSAmJiAoKGZvdW5kVGVtcGxhdGUgPSBCbGF6ZS5fZ2V0VGVtcGxhdGUobmFtZSwgYm91bmRUbXBsSW5zdGFuY2UpKSAhPSBudWxsKSkge1xuICAgIHJldHVybiBmb3VuZFRlbXBsYXRlO1xuICB9XG5cbiAgLy8gNC4gbG9vayB1cCBhIGdsb2JhbCBoZWxwZXJcbiAgaWYgKChoZWxwZXIgPSBCbGF6ZS5fZ2V0R2xvYmFsSGVscGVyKG5hbWUsIGJvdW5kVG1wbEluc3RhbmNlKSkgIT0gbnVsbCkge1xuICAgIHJldHVybiBoZWxwZXI7XG4gIH1cblxuICAvLyA1LiBsb29rIHVwIGluIGEgZGF0YSBjb250ZXh0XG4gIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIGlzQ2FsbGVkQXNGdW5jdGlvbiA9IChhcmd1bWVudHMubGVuZ3RoID4gMCk7XG4gICAgdmFyIGRhdGEgPSBCbGF6ZS5nZXREYXRhKCk7XG4gICAgdmFyIHggPSBkYXRhICYmIGRhdGFbbmFtZV07XG4gICAgaWYgKCEgeCkge1xuICAgICAgaWYgKGxvb2t1cFRlbXBsYXRlKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIk5vIHN1Y2ggdGVtcGxhdGU6IFwiICsgbmFtZSk7XG4gICAgICB9IGVsc2UgaWYgKGlzQ2FsbGVkQXNGdW5jdGlvbikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJObyBzdWNoIGZ1bmN0aW9uOiBcIiArIG5hbWUpO1xuICAgICAgfSBlbHNlIGlmIChuYW1lLmNoYXJBdCgwKSA9PT0gJ0AnICYmICgoeCA9PT0gbnVsbCkgfHxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKHggPT09IHVuZGVmaW5lZCkpKSB7XG4gICAgICAgIC8vIFRocm93IGFuIGVycm9yIGlmIHRoZSB1c2VyIHRyaWVzIHRvIHVzZSBhIGBAZGlyZWN0aXZlYFxuICAgICAgICAvLyB0aGF0IGRvZXNuJ3QgZXhpc3QuICBXZSBkb24ndCBpbXBsZW1lbnQgYWxsIGRpcmVjdGl2ZXNcbiAgICAgICAgLy8gZnJvbSBIYW5kbGViYXJzLCBzbyB0aGVyZSdzIGEgcG90ZW50aWFsIGZvciBjb25mdXNpb25cbiAgICAgICAgLy8gaWYgd2UgZmFpbCBzaWxlbnRseS4gIE9uIHRoZSBvdGhlciBoYW5kLCB3ZSB3YW50IHRvXG4gICAgICAgIC8vIHRocm93IGxhdGUgaW4gY2FzZSBzb21lIGFwcCBvciBwYWNrYWdlIHdhbnRzIHRvIHByb3ZpZGVcbiAgICAgICAgLy8gYSBtaXNzaW5nIGRpcmVjdGl2ZS5cbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiVW5zdXBwb3J0ZWQgZGlyZWN0aXZlOiBcIiArIG5hbWUpO1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAoISBkYXRhKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gICAgaWYgKHR5cGVvZiB4ICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICBpZiAoaXNDYWxsZWRBc0Z1bmN0aW9uKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIkNhbid0IGNhbGwgbm9uLWZ1bmN0aW9uOiBcIiArIHgpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHg7XG4gICAgfVxuICAgIHJldHVybiB4LmFwcGx5KGRhdGEsIGFyZ3VtZW50cyk7XG4gIH07XG59O1xuXG4vLyBJbXBsZW1lbnQgU3BhY2ViYXJzJyB7ey4uLy4ufX0uXG4vLyBAcGFyYW0gaGVpZ2h0IHtOdW1iZXJ9IFRoZSBudW1iZXIgb2YgJy4uJ3NcbkJsYXplLl9wYXJlbnREYXRhID0gZnVuY3Rpb24gKGhlaWdodCwgX2Z1bmN0aW9uV3JhcHBlZCkge1xuICAvLyBJZiBoZWlnaHQgaXMgbnVsbCBvciB1bmRlZmluZWQsIHdlIGRlZmF1bHQgdG8gMSwgdGhlIGZpcnN0IHBhcmVudC5cbiAgaWYgKGhlaWdodCA9PSBudWxsKSB7XG4gICAgaGVpZ2h0ID0gMTtcbiAgfVxuICB2YXIgdGhlV2l0aCA9IEJsYXplLmdldFZpZXcoJ3dpdGgnKTtcbiAgZm9yICh2YXIgaSA9IDA7IChpIDwgaGVpZ2h0KSAmJiB0aGVXaXRoOyBpKyspIHtcbiAgICB0aGVXaXRoID0gQmxhemUuZ2V0Vmlldyh0aGVXaXRoLCAnd2l0aCcpO1xuICB9XG5cbiAgaWYgKCEgdGhlV2l0aClcbiAgICByZXR1cm4gbnVsbDtcbiAgaWYgKF9mdW5jdGlvbldyYXBwZWQpXG4gICAgcmV0dXJuIGZ1bmN0aW9uICgpIHsgcmV0dXJuIHRoZVdpdGguZGF0YVZhci5nZXQoKTsgfTtcbiAgcmV0dXJuIHRoZVdpdGguZGF0YVZhci5nZXQoKTtcbn07XG5cblxuQmxhemUuVmlldy5wcm90b3R5cGUubG9va3VwVGVtcGxhdGUgPSBmdW5jdGlvbiAobmFtZSkge1xuICByZXR1cm4gdGhpcy5sb29rdXAobmFtZSwge3RlbXBsYXRlOnRydWV9KTtcbn07XG4iLCJpbXBvcnQgaXNPYmplY3QgZnJvbSAnbG9kYXNoLmlzb2JqZWN0JztcbmltcG9ydCBpc0Z1bmN0aW9uIGZyb20gJ2xvZGFzaC5pc2Z1bmN0aW9uJztcbmltcG9ydCBoYXMgZnJvbSAnbG9kYXNoLmhhcyc7XG5pbXBvcnQgaXNFbXB0eSBmcm9tICdsb2Rhc2guaXNlbXB0eSc7XG5cbi8vIFtuZXddIEJsYXplLlRlbXBsYXRlKFt2aWV3TmFtZV0sIHJlbmRlckZ1bmN0aW9uKVxuLy9cbi8vIGBCbGF6ZS5UZW1wbGF0ZWAgaXMgdGhlIGNsYXNzIG9mIHRlbXBsYXRlcywgbGlrZSBgVGVtcGxhdGUuZm9vYCBpblxuLy8gTWV0ZW9yLCB3aGljaCBpcyBgaW5zdGFuY2VvZiBUZW1wbGF0ZWAuXG4vL1xuLy8gYHZpZXdLaW5kYCBpcyBhIHN0cmluZyB0aGF0IGxvb2tzIGxpa2UgXCJUZW1wbGF0ZS5mb29cIiBmb3IgdGVtcGxhdGVzXG4vLyBkZWZpbmVkIGJ5IHRoZSBjb21waWxlci5cblxuLyoqXG4gKiBAY2xhc3NcbiAqIEBzdW1tYXJ5IENvbnN0cnVjdG9yIGZvciBhIFRlbXBsYXRlLCB3aGljaCBpcyB1c2VkIHRvIGNvbnN0cnVjdCBWaWV3cyB3aXRoIHBhcnRpY3VsYXIgbmFtZSBhbmQgY29udGVudC5cbiAqIEBsb2N1cyBDbGllbnRcbiAqIEBwYXJhbSB7U3RyaW5nfSBbdmlld05hbWVdIE9wdGlvbmFsLiAgQSBuYW1lIGZvciBWaWV3cyBjb25zdHJ1Y3RlZCBieSB0aGlzIFRlbXBsYXRlLiAgU2VlIFtgdmlldy5uYW1lYF0oI3ZpZXdfbmFtZSkuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSByZW5kZXJGdW5jdGlvbiBBIGZ1bmN0aW9uIHRoYXQgcmV0dXJucyBbKnJlbmRlcmFibGUgY29udGVudCpdKCNSZW5kZXJhYmxlLUNvbnRlbnQpLiAgVGhpcyBmdW5jdGlvbiBpcyB1c2VkIGFzIHRoZSBgcmVuZGVyRnVuY3Rpb25gIGZvciBWaWV3cyBjb25zdHJ1Y3RlZCBieSB0aGlzIFRlbXBsYXRlLlxuICovXG5CbGF6ZS5UZW1wbGF0ZSA9IGZ1bmN0aW9uICh2aWV3TmFtZSwgcmVuZGVyRnVuY3Rpb24pIHtcbiAgaWYgKCEgKHRoaXMgaW5zdGFuY2VvZiBCbGF6ZS5UZW1wbGF0ZSkpXG4gICAgLy8gY2FsbGVkIHdpdGhvdXQgYG5ld2BcbiAgICByZXR1cm4gbmV3IEJsYXplLlRlbXBsYXRlKHZpZXdOYW1lLCByZW5kZXJGdW5jdGlvbik7XG5cbiAgaWYgKHR5cGVvZiB2aWV3TmFtZSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgIC8vIG9taXR0ZWQgXCJ2aWV3TmFtZVwiIGFyZ3VtZW50XG4gICAgcmVuZGVyRnVuY3Rpb24gPSB2aWV3TmFtZTtcbiAgICB2aWV3TmFtZSA9ICcnO1xuICB9XG4gIGlmICh0eXBlb2Ygdmlld05hbWUgIT09ICdzdHJpbmcnKVxuICAgIHRocm93IG5ldyBFcnJvcihcInZpZXdOYW1lIG11c3QgYmUgYSBTdHJpbmcgKG9yIG9taXR0ZWQpXCIpO1xuICBpZiAodHlwZW9mIHJlbmRlckZ1bmN0aW9uICE9PSAnZnVuY3Rpb24nKVxuICAgIHRocm93IG5ldyBFcnJvcihcInJlbmRlckZ1bmN0aW9uIG11c3QgYmUgYSBmdW5jdGlvblwiKTtcblxuICB0aGlzLnZpZXdOYW1lID0gdmlld05hbWU7XG4gIHRoaXMucmVuZGVyRnVuY3Rpb24gPSByZW5kZXJGdW5jdGlvbjtcblxuICB0aGlzLl9faGVscGVycyA9IG5ldyBIZWxwZXJNYXA7XG4gIHRoaXMuX19ldmVudE1hcHMgPSBbXTtcblxuICB0aGlzLl9jYWxsYmFja3MgPSB7XG4gICAgY3JlYXRlZDogW10sXG4gICAgcmVuZGVyZWQ6IFtdLFxuICAgIGRlc3Ryb3llZDogW11cbiAgfTtcbn07XG52YXIgVGVtcGxhdGUgPSBCbGF6ZS5UZW1wbGF0ZTtcblxudmFyIEhlbHBlck1hcCA9IGZ1bmN0aW9uICgpIHt9O1xuSGVscGVyTWFwLnByb3RvdHlwZS5nZXQgPSBmdW5jdGlvbiAobmFtZSkge1xuICByZXR1cm4gdGhpc1snICcrbmFtZV07XG59O1xuSGVscGVyTWFwLnByb3RvdHlwZS5zZXQgPSBmdW5jdGlvbiAobmFtZSwgaGVscGVyKSB7XG4gIHRoaXNbJyAnK25hbWVdID0gaGVscGVyO1xufTtcbkhlbHBlck1hcC5wcm90b3R5cGUuaGFzID0gZnVuY3Rpb24gKG5hbWUpIHtcbiAgcmV0dXJuICh0eXBlb2YgdGhpc1snICcrbmFtZV0gIT09ICd1bmRlZmluZWQnKTtcbn07XG5cbi8qKlxuICogQHN1bW1hcnkgUmV0dXJucyB0cnVlIGlmIGB2YWx1ZWAgaXMgYSB0ZW1wbGF0ZSBvYmplY3QgbGlrZSBgVGVtcGxhdGUubXlUZW1wbGF0ZWAuXG4gKiBAbG9jdXMgQ2xpZW50XG4gKiBAcGFyYW0ge0FueX0gdmFsdWUgVGhlIHZhbHVlIHRvIHRlc3QuXG4gKi9cbkJsYXplLmlzVGVtcGxhdGUgPSBmdW5jdGlvbiAodCkge1xuICByZXR1cm4gKHQgaW5zdGFuY2VvZiBCbGF6ZS5UZW1wbGF0ZSk7XG59O1xuXG4vKipcbiAqIEBuYW1lICBvbkNyZWF0ZWRcbiAqIEBpbnN0YW5jZVxuICogQG1lbWJlck9mIFRlbXBsYXRlXG4gKiBAc3VtbWFyeSBSZWdpc3RlciBhIGZ1bmN0aW9uIHRvIGJlIGNhbGxlZCB3aGVuIGFuIGluc3RhbmNlIG9mIHRoaXMgdGVtcGxhdGUgaXMgY3JlYXRlZC5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrIEEgZnVuY3Rpb24gdG8gYmUgYWRkZWQgYXMgYSBjYWxsYmFjay5cbiAqIEBsb2N1cyBDbGllbnRcbiAqIEBpbXBvcnRGcm9tUGFja2FnZSB0ZW1wbGF0aW5nXG4gKi9cblRlbXBsYXRlLnByb3RvdHlwZS5vbkNyZWF0ZWQgPSBmdW5jdGlvbiAoY2IpIHtcbiAgdGhpcy5fY2FsbGJhY2tzLmNyZWF0ZWQucHVzaChjYik7XG59O1xuXG4vKipcbiAqIEBuYW1lICBvblJlbmRlcmVkXG4gKiBAaW5zdGFuY2VcbiAqIEBtZW1iZXJPZiBUZW1wbGF0ZVxuICogQHN1bW1hcnkgUmVnaXN0ZXIgYSBmdW5jdGlvbiB0byBiZSBjYWxsZWQgd2hlbiBhbiBpbnN0YW5jZSBvZiB0aGlzIHRlbXBsYXRlIGlzIGluc2VydGVkIGludG8gdGhlIERPTS5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrIEEgZnVuY3Rpb24gdG8gYmUgYWRkZWQgYXMgYSBjYWxsYmFjay5cbiAqIEBsb2N1cyBDbGllbnRcbiAqIEBpbXBvcnRGcm9tUGFja2FnZSB0ZW1wbGF0aW5nXG4gKi9cblRlbXBsYXRlLnByb3RvdHlwZS5vblJlbmRlcmVkID0gZnVuY3Rpb24gKGNiKSB7XG4gIHRoaXMuX2NhbGxiYWNrcy5yZW5kZXJlZC5wdXNoKGNiKTtcbn07XG5cbi8qKlxuICogQG5hbWUgIG9uRGVzdHJveWVkXG4gKiBAaW5zdGFuY2VcbiAqIEBtZW1iZXJPZiBUZW1wbGF0ZVxuICogQHN1bW1hcnkgUmVnaXN0ZXIgYSBmdW5jdGlvbiB0byBiZSBjYWxsZWQgd2hlbiBhbiBpbnN0YW5jZSBvZiB0aGlzIHRlbXBsYXRlIGlzIHJlbW92ZWQgZnJvbSB0aGUgRE9NIGFuZCBkZXN0cm95ZWQuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjayBBIGZ1bmN0aW9uIHRvIGJlIGFkZGVkIGFzIGEgY2FsbGJhY2suXG4gKiBAbG9jdXMgQ2xpZW50XG4gKiBAaW1wb3J0RnJvbVBhY2thZ2UgdGVtcGxhdGluZ1xuICovXG5UZW1wbGF0ZS5wcm90b3R5cGUub25EZXN0cm95ZWQgPSBmdW5jdGlvbiAoY2IpIHtcbiAgdGhpcy5fY2FsbGJhY2tzLmRlc3Ryb3llZC5wdXNoKGNiKTtcbn07XG5cblRlbXBsYXRlLnByb3RvdHlwZS5fZ2V0Q2FsbGJhY2tzID0gZnVuY3Rpb24gKHdoaWNoKSB7XG4gIHZhciBzZWxmID0gdGhpcztcbiAgdmFyIGNhbGxiYWNrcyA9IHNlbGZbd2hpY2hdID8gW3NlbGZbd2hpY2hdXSA6IFtdO1xuICAvLyBGaXJlIGFsbCBjYWxsYmFja3MgYWRkZWQgd2l0aCB0aGUgbmV3IEFQSSAoVGVtcGxhdGUub25SZW5kZXJlZCgpKVxuICAvLyBhcyB3ZWxsIGFzIHRoZSBvbGQtc3R5bGUgY2FsbGJhY2sgKGUuZy4gVGVtcGxhdGUucmVuZGVyZWQpIGZvclxuICAvLyBiYWNrd2FyZHMtY29tcGF0aWJpbGl0eS5cbiAgY2FsbGJhY2tzID0gY2FsbGJhY2tzLmNvbmNhdChzZWxmLl9jYWxsYmFja3Nbd2hpY2hdKTtcbiAgcmV0dXJuIGNhbGxiYWNrcztcbn07XG5cbnZhciBmaXJlQ2FsbGJhY2tzID0gZnVuY3Rpb24gKGNhbGxiYWNrcywgdGVtcGxhdGUpIHtcbiAgVGVtcGxhdGUuX3dpdGhUZW1wbGF0ZUluc3RhbmNlRnVuYyhcbiAgICBmdW5jdGlvbiAoKSB7IHJldHVybiB0ZW1wbGF0ZTsgfSxcbiAgICBmdW5jdGlvbiAoKSB7XG4gICAgICBmb3IgKHZhciBpID0gMCwgTiA9IGNhbGxiYWNrcy5sZW5ndGg7IGkgPCBOOyBpKyspIHtcbiAgICAgICAgY2FsbGJhY2tzW2ldLmNhbGwodGVtcGxhdGUpO1xuICAgICAgfVxuICAgIH0pO1xufTtcblxuVGVtcGxhdGUucHJvdG90eXBlLmNvbnN0cnVjdFZpZXcgPSBmdW5jdGlvbiAoY29udGVudEZ1bmMsIGVsc2VGdW5jKSB7XG4gIHZhciBzZWxmID0gdGhpcztcbiAgdmFyIHZpZXcgPSBCbGF6ZS5WaWV3KHNlbGYudmlld05hbWUsIHNlbGYucmVuZGVyRnVuY3Rpb24pO1xuICB2aWV3LnRlbXBsYXRlID0gc2VsZjtcblxuICB2aWV3LnRlbXBsYXRlQ29udGVudEJsb2NrID0gKFxuICAgIGNvbnRlbnRGdW5jID8gbmV3IFRlbXBsYXRlKCcoY29udGVudEJsb2NrKScsIGNvbnRlbnRGdW5jKSA6IG51bGwpO1xuICB2aWV3LnRlbXBsYXRlRWxzZUJsb2NrID0gKFxuICAgIGVsc2VGdW5jID8gbmV3IFRlbXBsYXRlKCcoZWxzZUJsb2NrKScsIGVsc2VGdW5jKSA6IG51bGwpO1xuXG4gIGlmIChzZWxmLl9fZXZlbnRNYXBzIHx8IHR5cGVvZiBzZWxmLmV2ZW50cyA9PT0gJ29iamVjdCcpIHtcbiAgICB2aWV3Ll9vblZpZXdSZW5kZXJlZChmdW5jdGlvbiAoKSB7XG4gICAgICBpZiAodmlldy5yZW5kZXJDb3VudCAhPT0gMSlcbiAgICAgICAgcmV0dXJuO1xuXG4gICAgICBpZiAoISBzZWxmLl9fZXZlbnRNYXBzLmxlbmd0aCAmJiB0eXBlb2Ygc2VsZi5ldmVudHMgPT09IFwib2JqZWN0XCIpIHtcbiAgICAgICAgLy8gUHJvdmlkZSBsaW1pdGVkIGJhY2stY29tcGF0IHN1cHBvcnQgZm9yIGAuZXZlbnRzID0gey4uLn1gXG4gICAgICAgIC8vIHN5bnRheC4gIFBhc3MgYHRlbXBsYXRlLmV2ZW50c2AgdG8gdGhlIG9yaWdpbmFsIGAuZXZlbnRzKC4uLilgXG4gICAgICAgIC8vIGZ1bmN0aW9uLiAgVGhpcyBjb2RlIG11c3QgcnVuIG9ubHkgb25jZSBwZXIgdGVtcGxhdGUsIGluXG4gICAgICAgIC8vIG9yZGVyIHRvIG5vdCBiaW5kIHRoZSBoYW5kbGVycyBtb3JlIHRoYW4gb25jZSwgd2hpY2ggaXNcbiAgICAgICAgLy8gZW5zdXJlZCBieSB0aGUgZmFjdCB0aGF0IHdlIG9ubHkgZG8gdGhpcyB3aGVuIGBfX2V2ZW50TWFwc2BcbiAgICAgICAgLy8gaXMgZmFsc3ksIGFuZCB3ZSBjYXVzZSBpdCB0byBiZSBzZXQgbm93LlxuICAgICAgICBUZW1wbGF0ZS5wcm90b3R5cGUuZXZlbnRzLmNhbGwoc2VsZiwgc2VsZi5ldmVudHMpO1xuICAgICAgfVxuXG4gICAgICBzZWxmLl9fZXZlbnRNYXBzLmZvckVhY2goZnVuY3Rpb24gKG0pIHtcbiAgICAgICAgQmxhemUuX2FkZEV2ZW50TWFwKHZpZXcsIG0sIHZpZXcpO1xuICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICB2aWV3Ll90ZW1wbGF0ZUluc3RhbmNlID0gbmV3IEJsYXplLlRlbXBsYXRlSW5zdGFuY2Uodmlldyk7XG4gIHZpZXcudGVtcGxhdGVJbnN0YW5jZSA9IGZ1bmN0aW9uICgpIHtcbiAgICAvLyBVcGRhdGUgZGF0YSwgZmlyc3ROb2RlLCBhbmQgbGFzdE5vZGUsIGFuZCByZXR1cm4gdGhlIFRlbXBsYXRlSW5zdGFuY2VcbiAgICAvLyBvYmplY3QuXG4gICAgdmFyIGluc3QgPSB2aWV3Ll90ZW1wbGF0ZUluc3RhbmNlO1xuXG4gICAgLyoqXG4gICAgICogQGluc3RhbmNlXG4gICAgICogQG1lbWJlck9mIEJsYXplLlRlbXBsYXRlSW5zdGFuY2VcbiAgICAgKiBAbmFtZSAgZGF0YVxuICAgICAqIEBzdW1tYXJ5IFRoZSBkYXRhIGNvbnRleHQgb2YgdGhpcyBpbnN0YW5jZSdzIGxhdGVzdCBpbnZvY2F0aW9uLlxuICAgICAqIEBsb2N1cyBDbGllbnRcbiAgICAgKi9cbiAgICBpbnN0LmRhdGEgPSBCbGF6ZS5nZXREYXRhKHZpZXcpO1xuXG4gICAgaWYgKHZpZXcuX2RvbXJhbmdlICYmICF2aWV3LmlzRGVzdHJveWVkKSB7XG4gICAgICBpbnN0LmZpcnN0Tm9kZSA9IHZpZXcuX2RvbXJhbmdlLmZpcnN0Tm9kZSgpO1xuICAgICAgaW5zdC5sYXN0Tm9kZSA9IHZpZXcuX2RvbXJhbmdlLmxhc3ROb2RlKCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIG9uICdjcmVhdGVkJyBvciAnZGVzdHJveWVkJyBjYWxsYmFja3Mgd2UgZG9uJ3QgaGF2ZSBhIERvbVJhbmdlXG4gICAgICBpbnN0LmZpcnN0Tm9kZSA9IG51bGw7XG4gICAgICBpbnN0Lmxhc3ROb2RlID0gbnVsbDtcbiAgICB9XG5cbiAgICByZXR1cm4gaW5zdDtcbiAgfTtcblxuICAvKipcbiAgICogQG5hbWUgIGNyZWF0ZWRcbiAgICogQGluc3RhbmNlXG4gICAqIEBtZW1iZXJPZiBUZW1wbGF0ZVxuICAgKiBAc3VtbWFyeSBQcm92aWRlIGEgY2FsbGJhY2sgd2hlbiBhbiBpbnN0YW5jZSBvZiBhIHRlbXBsYXRlIGlzIGNyZWF0ZWQuXG4gICAqIEBsb2N1cyBDbGllbnRcbiAgICogQGRlcHJlY2F0ZWQgaW4gMS4xXG4gICAqL1xuICAvLyBUbyBhdm9pZCBzaXR1YXRpb25zIHdoZW4gbmV3IGNhbGxiYWNrcyBhcmUgYWRkZWQgaW4gYmV0d2VlbiB2aWV3XG4gIC8vIGluc3RhbnRpYXRpb24gYW5kIGV2ZW50IGJlaW5nIGZpcmVkLCBkZWNpZGUgb24gYWxsIGNhbGxiYWNrcyB0byBmaXJlXG4gIC8vIGltbWVkaWF0ZWx5IGFuZCB0aGVuIGZpcmUgdGhlbSBvbiB0aGUgZXZlbnQuXG4gIHZhciBjcmVhdGVkQ2FsbGJhY2tzID0gc2VsZi5fZ2V0Q2FsbGJhY2tzKCdjcmVhdGVkJyk7XG4gIHZpZXcub25WaWV3Q3JlYXRlZChmdW5jdGlvbiAoKSB7XG4gICAgZmlyZUNhbGxiYWNrcyhjcmVhdGVkQ2FsbGJhY2tzLCB2aWV3LnRlbXBsYXRlSW5zdGFuY2UoKSk7XG4gIH0pO1xuXG4gIC8qKlxuICAgKiBAbmFtZSAgcmVuZGVyZWRcbiAgICogQGluc3RhbmNlXG4gICAqIEBtZW1iZXJPZiBUZW1wbGF0ZVxuICAgKiBAc3VtbWFyeSBQcm92aWRlIGEgY2FsbGJhY2sgd2hlbiBhbiBpbnN0YW5jZSBvZiBhIHRlbXBsYXRlIGlzIHJlbmRlcmVkLlxuICAgKiBAbG9jdXMgQ2xpZW50XG4gICAqIEBkZXByZWNhdGVkIGluIDEuMVxuICAgKi9cbiAgdmFyIHJlbmRlcmVkQ2FsbGJhY2tzID0gc2VsZi5fZ2V0Q2FsbGJhY2tzKCdyZW5kZXJlZCcpO1xuICB2aWV3Lm9uVmlld1JlYWR5KGZ1bmN0aW9uICgpIHtcbiAgICBmaXJlQ2FsbGJhY2tzKHJlbmRlcmVkQ2FsbGJhY2tzLCB2aWV3LnRlbXBsYXRlSW5zdGFuY2UoKSk7XG4gIH0pO1xuXG4gIC8qKlxuICAgKiBAbmFtZSAgZGVzdHJveWVkXG4gICAqIEBpbnN0YW5jZVxuICAgKiBAbWVtYmVyT2YgVGVtcGxhdGVcbiAgICogQHN1bW1hcnkgUHJvdmlkZSBhIGNhbGxiYWNrIHdoZW4gYW4gaW5zdGFuY2Ugb2YgYSB0ZW1wbGF0ZSBpcyBkZXN0cm95ZWQuXG4gICAqIEBsb2N1cyBDbGllbnRcbiAgICogQGRlcHJlY2F0ZWQgaW4gMS4xXG4gICAqL1xuICB2YXIgZGVzdHJveWVkQ2FsbGJhY2tzID0gc2VsZi5fZ2V0Q2FsbGJhY2tzKCdkZXN0cm95ZWQnKTtcbiAgdmlldy5vblZpZXdEZXN0cm95ZWQoZnVuY3Rpb24gKCkge1xuICAgIGZpcmVDYWxsYmFja3MoZGVzdHJveWVkQ2FsbGJhY2tzLCB2aWV3LnRlbXBsYXRlSW5zdGFuY2UoKSk7XG4gIH0pO1xuXG4gIHJldHVybiB2aWV3O1xufTtcblxuLyoqXG4gKiBAY2xhc3NcbiAqIEBzdW1tYXJ5IFRoZSBjbGFzcyBmb3IgdGVtcGxhdGUgaW5zdGFuY2VzXG4gKiBAcGFyYW0ge0JsYXplLlZpZXd9IHZpZXdcbiAqIEBpbnN0YW5jZU5hbWUgdGVtcGxhdGVcbiAqL1xuQmxhemUuVGVtcGxhdGVJbnN0YW5jZSA9IGZ1bmN0aW9uICh2aWV3KSB7XG4gIGlmICghICh0aGlzIGluc3RhbmNlb2YgQmxhemUuVGVtcGxhdGVJbnN0YW5jZSkpXG4gICAgLy8gY2FsbGVkIHdpdGhvdXQgYG5ld2BcbiAgICByZXR1cm4gbmV3IEJsYXplLlRlbXBsYXRlSW5zdGFuY2Uodmlldyk7XG5cbiAgaWYgKCEgKHZpZXcgaW5zdGFuY2VvZiBCbGF6ZS5WaWV3KSlcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJWaWV3IHJlcXVpcmVkXCIpO1xuXG4gIHZpZXcuX3RlbXBsYXRlSW5zdGFuY2UgPSB0aGlzO1xuXG4gIC8qKlxuICAgKiBAbmFtZSB2aWV3XG4gICAqIEBtZW1iZXJPZiBCbGF6ZS5UZW1wbGF0ZUluc3RhbmNlXG4gICAqIEBpbnN0YW5jZVxuICAgKiBAc3VtbWFyeSBUaGUgW1ZpZXddKC4uL2FwaS9ibGF6ZS5odG1sI0JsYXplLVZpZXcpIG9iamVjdCBmb3IgdGhpcyBpbnZvY2F0aW9uIG9mIHRoZSB0ZW1wbGF0ZS5cbiAgICogQGxvY3VzIENsaWVudFxuICAgKiBAdHlwZSB7QmxhemUuVmlld31cbiAgICovXG4gIHRoaXMudmlldyA9IHZpZXc7XG4gIHRoaXMuZGF0YSA9IG51bGw7XG5cbiAgLyoqXG4gICAqIEBuYW1lIGZpcnN0Tm9kZVxuICAgKiBAbWVtYmVyT2YgQmxhemUuVGVtcGxhdGVJbnN0YW5jZVxuICAgKiBAaW5zdGFuY2VcbiAgICogQHN1bW1hcnkgVGhlIGZpcnN0IHRvcC1sZXZlbCBET00gbm9kZSBpbiB0aGlzIHRlbXBsYXRlIGluc3RhbmNlLlxuICAgKiBAbG9jdXMgQ2xpZW50XG4gICAqIEB0eXBlIHtET01Ob2RlfVxuICAgKi9cbiAgdGhpcy5maXJzdE5vZGUgPSBudWxsO1xuXG4gIC8qKlxuICAgKiBAbmFtZSBsYXN0Tm9kZVxuICAgKiBAbWVtYmVyT2YgQmxhemUuVGVtcGxhdGVJbnN0YW5jZVxuICAgKiBAaW5zdGFuY2VcbiAgICogQHN1bW1hcnkgVGhlIGxhc3QgdG9wLWxldmVsIERPTSBub2RlIGluIHRoaXMgdGVtcGxhdGUgaW5zdGFuY2UuXG4gICAqIEBsb2N1cyBDbGllbnRcbiAgICogQHR5cGUge0RPTU5vZGV9XG4gICAqL1xuICB0aGlzLmxhc3ROb2RlID0gbnVsbDtcblxuICAvLyBUaGlzIGRlcGVuZGVuY3kgaXMgdXNlZCB0byBpZGVudGlmeSBzdGF0ZSB0cmFuc2l0aW9ucyBpblxuICAvLyBfc3Vic2NyaXB0aW9uSGFuZGxlcyB3aGljaCBjb3VsZCBjYXVzZSB0aGUgcmVzdWx0IG9mXG4gIC8vIFRlbXBsYXRlSW5zdGFuY2Ujc3Vic2NyaXB0aW9uc1JlYWR5IHRvIGNoYW5nZS4gQmFzaWNhbGx5IHRoaXMgaXMgdHJpZ2dlcmVkXG4gIC8vIHdoZW5ldmVyIGEgbmV3IHN1YnNjcmlwdGlvbiBoYW5kbGUgaXMgYWRkZWQgb3Igd2hlbiBhIHN1YnNjcmlwdGlvbiBoYW5kbGVcbiAgLy8gaXMgcmVtb3ZlZCBhbmQgdGhleSBhcmUgbm90IHJlYWR5LlxuICB0aGlzLl9hbGxTdWJzUmVhZHlEZXAgPSBuZXcgVHJhY2tlci5EZXBlbmRlbmN5KCk7XG4gIHRoaXMuX2FsbFN1YnNSZWFkeSA9IGZhbHNlO1xuXG4gIHRoaXMuX3N1YnNjcmlwdGlvbkhhbmRsZXMgPSB7fTtcbn07XG5cbi8qKlxuICogQHN1bW1hcnkgRmluZCBhbGwgZWxlbWVudHMgbWF0Y2hpbmcgYHNlbGVjdG9yYCBpbiB0aGlzIHRlbXBsYXRlIGluc3RhbmNlLCBhbmQgcmV0dXJuIHRoZW0gYXMgYSBKUXVlcnkgb2JqZWN0LlxuICogQGxvY3VzIENsaWVudFxuICogQHBhcmFtIHtTdHJpbmd9IHNlbGVjdG9yIFRoZSBDU1Mgc2VsZWN0b3IgdG8gbWF0Y2gsIHNjb3BlZCB0byB0aGUgdGVtcGxhdGUgY29udGVudHMuXG4gKiBAcmV0dXJucyB7RE9NTm9kZVtdfVxuICovXG5CbGF6ZS5UZW1wbGF0ZUluc3RhbmNlLnByb3RvdHlwZS4kID0gZnVuY3Rpb24gKHNlbGVjdG9yKSB7XG4gIHZhciB2aWV3ID0gdGhpcy52aWV3O1xuICBpZiAoISB2aWV3Ll9kb21yYW5nZSlcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJDYW4ndCB1c2UgJCBvbiB0ZW1wbGF0ZSBpbnN0YW5jZSB3aXRoIG5vIERPTVwiKTtcbiAgcmV0dXJuIHZpZXcuX2RvbXJhbmdlLiQoc2VsZWN0b3IpO1xufTtcblxuLyoqXG4gKiBAc3VtbWFyeSBGaW5kIGFsbCBlbGVtZW50cyBtYXRjaGluZyBgc2VsZWN0b3JgIGluIHRoaXMgdGVtcGxhdGUgaW5zdGFuY2UuXG4gKiBAbG9jdXMgQ2xpZW50XG4gKiBAcGFyYW0ge1N0cmluZ30gc2VsZWN0b3IgVGhlIENTUyBzZWxlY3RvciB0byBtYXRjaCwgc2NvcGVkIHRvIHRoZSB0ZW1wbGF0ZSBjb250ZW50cy5cbiAqIEByZXR1cm5zIHtET01FbGVtZW50W119XG4gKi9cbkJsYXplLlRlbXBsYXRlSW5zdGFuY2UucHJvdG90eXBlLmZpbmRBbGwgPSBmdW5jdGlvbiAoc2VsZWN0b3IpIHtcbiAgcmV0dXJuIEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKHRoaXMuJChzZWxlY3RvcikpO1xufTtcblxuLyoqXG4gKiBAc3VtbWFyeSBGaW5kIG9uZSBlbGVtZW50IG1hdGNoaW5nIGBzZWxlY3RvcmAgaW4gdGhpcyB0ZW1wbGF0ZSBpbnN0YW5jZS5cbiAqIEBsb2N1cyBDbGllbnRcbiAqIEBwYXJhbSB7U3RyaW5nfSBzZWxlY3RvciBUaGUgQ1NTIHNlbGVjdG9yIHRvIG1hdGNoLCBzY29wZWQgdG8gdGhlIHRlbXBsYXRlIGNvbnRlbnRzLlxuICogQHJldHVybnMge0RPTUVsZW1lbnR9XG4gKi9cbkJsYXplLlRlbXBsYXRlSW5zdGFuY2UucHJvdG90eXBlLmZpbmQgPSBmdW5jdGlvbiAoc2VsZWN0b3IpIHtcbiAgdmFyIHJlc3VsdCA9IHRoaXMuJChzZWxlY3Rvcik7XG4gIHJldHVybiByZXN1bHRbMF0gfHwgbnVsbDtcbn07XG5cbi8qKlxuICogQHN1bW1hcnkgQSB2ZXJzaW9uIG9mIFtUcmFja2VyLmF1dG9ydW5dKGh0dHBzOi8vZG9jcy5tZXRlb3IuY29tL2FwaS90cmFja2VyLmh0bWwjVHJhY2tlci1hdXRvcnVuKSB0aGF0IGlzIHN0b3BwZWQgd2hlbiB0aGUgdGVtcGxhdGUgaXMgZGVzdHJveWVkLlxuICogQGxvY3VzIENsaWVudFxuICogQHBhcmFtIHtGdW5jdGlvbn0gcnVuRnVuYyBUaGUgZnVuY3Rpb24gdG8gcnVuLiBJdCByZWNlaXZlcyBvbmUgYXJndW1lbnQ6IGEgVHJhY2tlci5Db21wdXRhdGlvbiBvYmplY3QuXG4gKi9cbkJsYXplLlRlbXBsYXRlSW5zdGFuY2UucHJvdG90eXBlLmF1dG9ydW4gPSBmdW5jdGlvbiAoZikge1xuICByZXR1cm4gdGhpcy52aWV3LmF1dG9ydW4oZik7XG59O1xuXG4vKipcbiAqIEBzdW1tYXJ5IEEgdmVyc2lvbiBvZiBbTWV0ZW9yLnN1YnNjcmliZV0oaHR0cHM6Ly9kb2NzLm1ldGVvci5jb20vYXBpL3B1YnN1Yi5odG1sI01ldGVvci1zdWJzY3JpYmUpIHRoYXQgaXMgc3RvcHBlZFxuICogd2hlbiB0aGUgdGVtcGxhdGUgaXMgZGVzdHJveWVkLlxuICogQHJldHVybiB7U3Vic2NyaXB0aW9uSGFuZGxlfSBUaGUgc3Vic2NyaXB0aW9uIGhhbmRsZSB0byB0aGUgbmV3bHkgbWFkZVxuICogc3Vic2NyaXB0aW9uLiBDYWxsIGBoYW5kbGUuc3RvcCgpYCB0byBtYW51YWxseSBzdG9wIHRoZSBzdWJzY3JpcHRpb24sIG9yXG4gKiBgaGFuZGxlLnJlYWR5KClgIHRvIGZpbmQgb3V0IGlmIHRoaXMgcGFydGljdWxhciBzdWJzY3JpcHRpb24gaGFzIGxvYWRlZCBhbGxcbiAqIG9mIGl0cyBpbml0YWwgZGF0YS5cbiAqIEBsb2N1cyBDbGllbnRcbiAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lIE5hbWUgb2YgdGhlIHN1YnNjcmlwdGlvbi4gIE1hdGNoZXMgdGhlIG5hbWUgb2YgdGhlXG4gKiBzZXJ2ZXIncyBgcHVibGlzaCgpYCBjYWxsLlxuICogQHBhcmFtIHtBbnl9IFthcmcxLGFyZzIuLi5dIE9wdGlvbmFsIGFyZ3VtZW50cyBwYXNzZWQgdG8gcHVibGlzaGVyIGZ1bmN0aW9uXG4gKiBvbiBzZXJ2ZXIuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufE9iamVjdH0gW29wdGlvbnNdIElmIGEgZnVuY3Rpb24gaXMgcGFzc2VkIGluc3RlYWQgb2YgYW5cbiAqIG9iamVjdCwgaXQgaXMgaW50ZXJwcmV0ZWQgYXMgYW4gYG9uUmVhZHlgIGNhbGxiYWNrLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gW29wdGlvbnMub25SZWFkeV0gUGFzc2VkIHRvIFtgTWV0ZW9yLnN1YnNjcmliZWBdKGh0dHBzOi8vZG9jcy5tZXRlb3IuY29tL2FwaS9wdWJzdWIuaHRtbCNNZXRlb3Itc3Vic2NyaWJlKS5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IFtvcHRpb25zLm9uU3RvcF0gUGFzc2VkIHRvIFtgTWV0ZW9yLnN1YnNjcmliZWBdKGh0dHBzOi8vZG9jcy5tZXRlb3IuY29tL2FwaS9wdWJzdWIuaHRtbCNNZXRlb3Itc3Vic2NyaWJlKS5cbiAqIEBwYXJhbSB7RERQLkNvbm5lY3Rpb259IFtvcHRpb25zLmNvbm5lY3Rpb25dIFRoZSBjb25uZWN0aW9uIG9uIHdoaWNoIHRvIG1ha2UgdGhlXG4gKiBzdWJzY3JpcHRpb24uXG4gKi9cbkJsYXplLlRlbXBsYXRlSW5zdGFuY2UucHJvdG90eXBlLnN1YnNjcmliZSA9IGZ1bmN0aW9uICguLi5hcmdzKSB7XG4gIHZhciBzZWxmID0gdGhpcztcblxuICB2YXIgc3ViSGFuZGxlcyA9IHNlbGYuX3N1YnNjcmlwdGlvbkhhbmRsZXM7XG5cbiAgLy8gRHVwbGljYXRlIGxvZ2ljIGZyb20gTWV0ZW9yLnN1YnNjcmliZVxuICB2YXIgb3B0aW9ucyA9IHt9O1xuICBpZiAoYXJncy5sZW5ndGgpIHtcbiAgICB2YXIgbGFzdFBhcmFtID0gYXJnc1thcmdzLmxlbmd0aCAtIDFdO1xuXG4gICAgLy8gTWF0Y2ggcGF0dGVybiB0byBjaGVjayBpZiB0aGUgbGFzdCBhcmcgaXMgYW4gb3B0aW9ucyBhcmd1bWVudFxuICAgIHZhciBsYXN0UGFyYW1PcHRpb25zUGF0dGVybiA9IHtcbiAgICAgIG9uUmVhZHk6IE1hdGNoLk9wdGlvbmFsKEZ1bmN0aW9uKSxcbiAgICAgIC8vIFhYWCBDT01QQVQgV0lUSCAxLjAuMy4xIG9uRXJyb3IgdXNlZCB0byBleGlzdCwgYnV0IG5vdyB3ZSB1c2VcbiAgICAgIC8vIG9uU3RvcCB3aXRoIGFuIGVycm9yIGNhbGxiYWNrIGluc3RlYWQuXG4gICAgICBvbkVycm9yOiBNYXRjaC5PcHRpb25hbChGdW5jdGlvbiksXG4gICAgICBvblN0b3A6IE1hdGNoLk9wdGlvbmFsKEZ1bmN0aW9uKSxcbiAgICAgIGNvbm5lY3Rpb246IE1hdGNoLk9wdGlvbmFsKE1hdGNoLkFueSlcbiAgICB9O1xuXG4gICAgaWYgKGlzRnVuY3Rpb24obGFzdFBhcmFtKSkge1xuICAgICAgb3B0aW9ucy5vblJlYWR5ID0gYXJncy5wb3AoKTtcbiAgICB9IGVsc2UgaWYgKGxhc3RQYXJhbSAmJiAhIGlzRW1wdHkobGFzdFBhcmFtKSAmJiBNYXRjaC50ZXN0KGxhc3RQYXJhbSwgbGFzdFBhcmFtT3B0aW9uc1BhdHRlcm4pKSB7XG4gICAgICBvcHRpb25zID0gYXJncy5wb3AoKTtcbiAgICB9XG4gIH1cblxuICB2YXIgc3ViSGFuZGxlO1xuICB2YXIgb2xkU3RvcHBlZCA9IG9wdGlvbnMub25TdG9wO1xuICBvcHRpb25zLm9uU3RvcCA9IGZ1bmN0aW9uIChlcnJvcikge1xuICAgIC8vIFdoZW4gdGhlIHN1YnNjcmlwdGlvbiBpcyBzdG9wcGVkLCByZW1vdmUgaXQgZnJvbSB0aGUgc2V0IG9mIHRyYWNrZWRcbiAgICAvLyBzdWJzY3JpcHRpb25zIHRvIGF2b2lkIHRoaXMgbGlzdCBncm93aW5nIHdpdGhvdXQgYm91bmRcbiAgICBkZWxldGUgc3ViSGFuZGxlc1tzdWJIYW5kbGUuc3Vic2NyaXB0aW9uSWRdO1xuXG4gICAgLy8gUmVtb3ZpbmcgYSBzdWJzY3JpcHRpb24gY2FuIG9ubHkgY2hhbmdlIHRoZSByZXN1bHQgb2Ygc3Vic2NyaXB0aW9uc1JlYWR5XG4gICAgLy8gaWYgd2UgYXJlIG5vdCByZWFkeSAodGhhdCBzdWJzY3JpcHRpb24gY291bGQgYmUgdGhlIG9uZSBibG9ja2luZyB1cyBiZWluZ1xuICAgIC8vIHJlYWR5KS5cbiAgICBpZiAoISBzZWxmLl9hbGxTdWJzUmVhZHkpIHtcbiAgICAgIHNlbGYuX2FsbFN1YnNSZWFkeURlcC5jaGFuZ2VkKCk7XG4gICAgfVxuXG4gICAgaWYgKG9sZFN0b3BwZWQpIHtcbiAgICAgIG9sZFN0b3BwZWQoZXJyb3IpO1xuICAgIH1cbiAgfTtcblxuICB2YXIgY29ubmVjdGlvbiA9IG9wdGlvbnMuY29ubmVjdGlvbjtcbiAgY29uc3QgeyBvblJlYWR5LCBvbkVycm9yLCBvblN0b3AgfSA9IG9wdGlvbnM7XG4gIHZhciBjYWxsYmFja3MgPSB7IG9uUmVhZHksIG9uRXJyb3IsIG9uU3RvcCB9O1xuXG4gIC8vIFRoZSBjYWxsYmFja3MgYXJlIHBhc3NlZCBhcyB0aGUgbGFzdCBpdGVtIGluIHRoZSBhcmd1bWVudHMgYXJyYXkgcGFzc2VkIHRvXG4gIC8vIFZpZXcjc3Vic2NyaWJlXG4gIGFyZ3MucHVzaChjYWxsYmFja3MpO1xuXG4gIC8vIFZpZXcjc3Vic2NyaWJlIHRha2VzIHRoZSBjb25uZWN0aW9uIGFzIG9uZSBvZiB0aGUgb3B0aW9ucyBpbiB0aGUgbGFzdFxuICAvLyBhcmd1bWVudFxuICBzdWJIYW5kbGUgPSBzZWxmLnZpZXcuc3Vic2NyaWJlLmNhbGwoc2VsZi52aWV3LCBhcmdzLCB7XG4gICAgY29ubmVjdGlvbjogY29ubmVjdGlvblxuICB9KTtcblxuICBpZiAoIWhhcyhzdWJIYW5kbGVzLCBzdWJIYW5kbGUuc3Vic2NyaXB0aW9uSWQpKSB7XG4gICAgc3ViSGFuZGxlc1tzdWJIYW5kbGUuc3Vic2NyaXB0aW9uSWRdID0gc3ViSGFuZGxlO1xuXG4gICAgLy8gQWRkaW5nIGEgbmV3IHN1YnNjcmlwdGlvbiB3aWxsIGFsd2F5cyBjYXVzZSB1cyB0byB0cmFuc2l0aW9uIGZyb20gcmVhZHlcbiAgICAvLyB0byBub3QgcmVhZHksIGJ1dCBpZiB3ZSBhcmUgYWxyZWFkeSBub3QgcmVhZHkgdGhlbiB0aGlzIGNhbid0IG1ha2UgdXNcbiAgICAvLyByZWFkeS5cbiAgICBpZiAoc2VsZi5fYWxsU3Vic1JlYWR5KSB7XG4gICAgICBzZWxmLl9hbGxTdWJzUmVhZHlEZXAuY2hhbmdlZCgpO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBzdWJIYW5kbGU7XG59O1xuXG4vKipcbiAqIEBzdW1tYXJ5IEEgcmVhY3RpdmUgZnVuY3Rpb24gdGhhdCByZXR1cm5zIHRydWUgd2hlbiBhbGwgb2YgdGhlIHN1YnNjcmlwdGlvbnNcbiAqIGNhbGxlZCB3aXRoIFt0aGlzLnN1YnNjcmliZV0oI1RlbXBsYXRlSW5zdGFuY2Utc3Vic2NyaWJlKSBhcmUgcmVhZHkuXG4gKiBAcmV0dXJuIHtCb29sZWFufSBUcnVlIGlmIGFsbCBzdWJzY3JpcHRpb25zIG9uIHRoaXMgdGVtcGxhdGUgaW5zdGFuY2UgYXJlXG4gKiByZWFkeS5cbiAqL1xuQmxhemUuVGVtcGxhdGVJbnN0YW5jZS5wcm90b3R5cGUuc3Vic2NyaXB0aW9uc1JlYWR5ID0gZnVuY3Rpb24gKCkge1xuICB0aGlzLl9hbGxTdWJzUmVhZHlEZXAuZGVwZW5kKCk7XG4gIHRoaXMuX2FsbFN1YnNSZWFkeSA9IE9iamVjdC52YWx1ZXModGhpcy5fc3Vic2NyaXB0aW9uSGFuZGxlcykuZXZlcnkoKGhhbmRsZSkgPT4geyAgXG4gICAgcmV0dXJuIGhhbmRsZS5yZWFkeSgpO1xuICB9KTtcblxuICByZXR1cm4gdGhpcy5fYWxsU3Vic1JlYWR5O1xufTtcblxuLyoqXG4gKiBAc3VtbWFyeSBTcGVjaWZ5IHRlbXBsYXRlIGhlbHBlcnMgYXZhaWxhYmxlIHRvIHRoaXMgdGVtcGxhdGUuXG4gKiBAbG9jdXMgQ2xpZW50XG4gKiBAcGFyYW0ge09iamVjdH0gaGVscGVycyBEaWN0aW9uYXJ5IG9mIGhlbHBlciBmdW5jdGlvbnMgYnkgbmFtZS5cbiAqIEBpbXBvcnRGcm9tUGFja2FnZSB0ZW1wbGF0aW5nXG4gKi9cblRlbXBsYXRlLnByb3RvdHlwZS5oZWxwZXJzID0gZnVuY3Rpb24gKGRpY3QpIHtcbiAgaWYgKCFpc09iamVjdChkaWN0KSkge1xuICAgIHRocm93IG5ldyBFcnJvcihcIkhlbHBlcnMgZGljdGlvbmFyeSBoYXMgdG8gYmUgYW4gb2JqZWN0XCIpO1xuICB9XG5cbiAgZm9yICh2YXIgayBpbiBkaWN0KSB0aGlzLl9faGVscGVycy5zZXQoaywgZGljdFtrXSk7XG59O1xuXG52YXIgY2FuVXNlR2V0dGVycyA9IChmdW5jdGlvbiAoKSB7XG4gIGlmIChPYmplY3QuZGVmaW5lUHJvcGVydHkpIHtcbiAgICB2YXIgb2JqID0ge307XG4gICAgdHJ5IHtcbiAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShvYmosIFwic2VsZlwiLCB7XG4gICAgICAgIGdldDogZnVuY3Rpb24gKCkgeyByZXR1cm4gb2JqOyB9XG4gICAgICB9KTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIHJldHVybiBvYmouc2VsZiA9PT0gb2JqO1xuICB9XG4gIHJldHVybiBmYWxzZTtcbn0pKCk7XG5cbmlmIChjYW5Vc2VHZXR0ZXJzKSB7XG4gIC8vIExpa2UgQmxhemUuY3VycmVudFZpZXcgYnV0IGZvciB0aGUgdGVtcGxhdGUgaW5zdGFuY2UuIEEgZnVuY3Rpb25cbiAgLy8gcmF0aGVyIHRoYW4gYSB2YWx1ZSBzbyB0aGF0IG5vdCBhbGwgaGVscGVycyBhcmUgaW1wbGljaXRseSBkZXBlbmRlbnRcbiAgLy8gb24gdGhlIGN1cnJlbnQgdGVtcGxhdGUgaW5zdGFuY2UncyBgZGF0YWAgcHJvcGVydHksIHdoaWNoIHdvdWxkIG1ha2VcbiAgLy8gdGhlbSBkZXBlbmRlbnQgb24gdGhlIGRhdGEgY29udGV4dCBvZiB0aGUgdGVtcGxhdGUgaW5jbHVzaW9uLlxuICB2YXIgY3VycmVudFRlbXBsYXRlSW5zdGFuY2VGdW5jID0gbnVsbDtcblxuICAvLyBJZiBnZXR0ZXJzIGFyZSBzdXBwb3J0ZWQsIGRlZmluZSB0aGlzIHByb3BlcnR5IHdpdGggYSBnZXR0ZXIgZnVuY3Rpb25cbiAgLy8gdG8gbWFrZSBpdCBlZmZlY3RpdmVseSByZWFkLW9ubHksIGFuZCB0byB3b3JrIGFyb3VuZCB0aGlzIGJpemFycmUgSlNDXG4gIC8vIGJ1ZzogaHR0cHM6Ly9naXRodWIuY29tL21ldGVvci9tZXRlb3IvaXNzdWVzLzk5MjZcbiAgT2JqZWN0LmRlZmluZVByb3BlcnR5KFRlbXBsYXRlLCBcIl9jdXJyZW50VGVtcGxhdGVJbnN0YW5jZUZ1bmNcIiwge1xuICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIGN1cnJlbnRUZW1wbGF0ZUluc3RhbmNlRnVuYztcbiAgICB9XG4gIH0pO1xuXG4gIFRlbXBsYXRlLl93aXRoVGVtcGxhdGVJbnN0YW5jZUZ1bmMgPSBmdW5jdGlvbiAodGVtcGxhdGVJbnN0YW5jZUZ1bmMsIGZ1bmMpIHtcbiAgICBpZiAodHlwZW9mIGZ1bmMgIT09ICdmdW5jdGlvbicpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGVkIGZ1bmN0aW9uLCBnb3Q6IFwiICsgZnVuYyk7XG4gICAgfVxuICAgIHZhciBvbGRUbXBsSW5zdGFuY2VGdW5jID0gY3VycmVudFRlbXBsYXRlSW5zdGFuY2VGdW5jO1xuICAgIHRyeSB7XG4gICAgICBjdXJyZW50VGVtcGxhdGVJbnN0YW5jZUZ1bmMgPSB0ZW1wbGF0ZUluc3RhbmNlRnVuYztcbiAgICAgIHJldHVybiBmdW5jKCk7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIGN1cnJlbnRUZW1wbGF0ZUluc3RhbmNlRnVuYyA9IG9sZFRtcGxJbnN0YW5jZUZ1bmM7XG4gICAgfVxuICB9O1xufSBlbHNlIHtcbiAgLy8gSWYgZ2V0dGVycyBhcmUgbm90IHN1cHBvcnRlZCwganVzdCB1c2UgYSBub3JtYWwgcHJvcGVydHkuXG4gIFRlbXBsYXRlLl9jdXJyZW50VGVtcGxhdGVJbnN0YW5jZUZ1bmMgPSBudWxsO1xuXG4gIFRlbXBsYXRlLl93aXRoVGVtcGxhdGVJbnN0YW5jZUZ1bmMgPSBmdW5jdGlvbiAodGVtcGxhdGVJbnN0YW5jZUZ1bmMsIGZ1bmMpIHtcbiAgICBpZiAodHlwZW9mIGZ1bmMgIT09ICdmdW5jdGlvbicpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGVkIGZ1bmN0aW9uLCBnb3Q6IFwiICsgZnVuYyk7XG4gICAgfVxuICAgIHZhciBvbGRUbXBsSW5zdGFuY2VGdW5jID0gVGVtcGxhdGUuX2N1cnJlbnRUZW1wbGF0ZUluc3RhbmNlRnVuYztcbiAgICB0cnkge1xuICAgICAgVGVtcGxhdGUuX2N1cnJlbnRUZW1wbGF0ZUluc3RhbmNlRnVuYyA9IHRlbXBsYXRlSW5zdGFuY2VGdW5jO1xuICAgICAgcmV0dXJuIGZ1bmMoKTtcbiAgICB9IGZpbmFsbHkge1xuICAgICAgVGVtcGxhdGUuX2N1cnJlbnRUZW1wbGF0ZUluc3RhbmNlRnVuYyA9IG9sZFRtcGxJbnN0YW5jZUZ1bmM7XG4gICAgfVxuICB9O1xufVxuXG4vKipcbiAqIEBzdW1tYXJ5IFNwZWNpZnkgZXZlbnQgaGFuZGxlcnMgZm9yIHRoaXMgdGVtcGxhdGUuXG4gKiBAbG9jdXMgQ2xpZW50XG4gKiBAcGFyYW0ge0V2ZW50TWFwfSBldmVudE1hcCBFdmVudCBoYW5kbGVycyB0byBhc3NvY2lhdGUgd2l0aCB0aGlzIHRlbXBsYXRlLlxuICogQGltcG9ydEZyb21QYWNrYWdlIHRlbXBsYXRpbmdcbiAqL1xuVGVtcGxhdGUucHJvdG90eXBlLmV2ZW50cyA9IGZ1bmN0aW9uIChldmVudE1hcCkge1xuICBpZiAoIWlzT2JqZWN0KGV2ZW50TWFwKSkge1xuICAgIHRocm93IG5ldyBFcnJvcihcIkV2ZW50IG1hcCBoYXMgdG8gYmUgYW4gb2JqZWN0XCIpO1xuICB9XG5cbiAgdmFyIHRlbXBsYXRlID0gdGhpcztcbiAgdmFyIGV2ZW50TWFwMiA9IHt9O1xuICBmb3IgKHZhciBrIGluIGV2ZW50TWFwKSB7XG4gICAgZXZlbnRNYXAyW2tdID0gKGZ1bmN0aW9uIChrLCB2KSB7XG4gICAgICByZXR1cm4gZnVuY3Rpb24gKGV2ZW50IC8qLCAuLi4qLykge1xuICAgICAgICB2YXIgdmlldyA9IHRoaXM7IC8vIHBhc3NlZCBieSBFdmVudEF1Z21lbnRlclxuICAgICAgICB2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cyk7XG4gICAgICAgIC8vIEV4aXRpbmcgdGhlIGN1cnJlbnQgY29tcHV0YXRpb24gdG8gYXZvaWQgY3JlYXRpbmcgdW5uZWNlc3NhcnlcbiAgICAgICAgLy8gYW5kIHVuZXhwZWN0ZWQgcmVhY3RpdmUgZGVwZW5kZW5jaWVzIHdpdGggVGVtcGxhdGVzIGRhdGFcbiAgICAgICAgLy8gb3IgYW55IG90aGVyIHJlYWN0aXZlIGRlcGVuZGVuY2llcyBkZWZpbmVkIGluIGV2ZW50IGhhbmRsZXJzXG4gICAgICAgIHJldHVybiBUcmFja2VyLm5vbnJlYWN0aXZlKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICB2YXIgZGF0YSA9IEJsYXplLmdldERhdGEoZXZlbnQuY3VycmVudFRhcmdldCk7XG4gICAgICAgICAgaWYgKGRhdGEgPT0gbnVsbCkgZGF0YSA9IHt9O1xuICAgICAgICAgIHZhciB0bXBsSW5zdGFuY2VGdW5jID0gQmxhemUuX2JpbmQodmlldy50ZW1wbGF0ZUluc3RhbmNlLCB2aWV3KTtcbiAgICAgICAgICBhcmdzLnNwbGljZSgxLCAwLCB0bXBsSW5zdGFuY2VGdW5jKCkpO1xuICAgICAgICAgIHJldHVybiBUZW1wbGF0ZS5fd2l0aFRlbXBsYXRlSW5zdGFuY2VGdW5jKHRtcGxJbnN0YW5jZUZ1bmMsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiB2LmFwcGx5KGRhdGEsIGFyZ3MpO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICAgIH07XG4gICAgfSkoaywgZXZlbnRNYXBba10pO1xuICB9XG5cbiAgdGVtcGxhdGUuX19ldmVudE1hcHMucHVzaChldmVudE1hcDIpO1xufTtcblxuLyoqXG4gKiBAZnVuY3Rpb25cbiAqIEBuYW1lIGluc3RhbmNlXG4gKiBAbWVtYmVyT2YgVGVtcGxhdGVcbiAqIEBzdW1tYXJ5IFRoZSBbdGVtcGxhdGUgaW5zdGFuY2VdKCNUZW1wbGF0ZS1pbnN0YW5jZXMpIGNvcnJlc3BvbmRpbmcgdG8gdGhlIGN1cnJlbnQgdGVtcGxhdGUgaGVscGVyLCBldmVudCBoYW5kbGVyLCBjYWxsYmFjaywgb3IgYXV0b3J1bi4gIElmIHRoZXJlIGlzbid0IG9uZSwgYG51bGxgLlxuICogQGxvY3VzIENsaWVudFxuICogQHJldHVybnMge0JsYXplLlRlbXBsYXRlSW5zdGFuY2V9XG4gKiBAaW1wb3J0RnJvbVBhY2thZ2UgdGVtcGxhdGluZ1xuICovXG5UZW1wbGF0ZS5pbnN0YW5jZSA9IGZ1bmN0aW9uICgpIHtcbiAgcmV0dXJuIFRlbXBsYXRlLl9jdXJyZW50VGVtcGxhdGVJbnN0YW5jZUZ1bmNcbiAgICAmJiBUZW1wbGF0ZS5fY3VycmVudFRlbXBsYXRlSW5zdGFuY2VGdW5jKCk7XG59O1xuXG4vLyBOb3RlOiBUZW1wbGF0ZS5jdXJyZW50RGF0YSgpIGlzIGRvY3VtZW50ZWQgdG8gdGFrZSB6ZXJvIGFyZ3VtZW50cyxcbi8vIHdoaWxlIEJsYXplLmdldERhdGEgdGFrZXMgdXAgdG8gb25lLlxuXG4vKipcbiAqIEBzdW1tYXJ5XG4gKlxuICogLSBJbnNpZGUgYW4gYG9uQ3JlYXRlZGAsIGBvblJlbmRlcmVkYCwgb3IgYG9uRGVzdHJveWVkYCBjYWxsYmFjaywgcmV0dXJuc1xuICogdGhlIGRhdGEgY29udGV4dCBvZiB0aGUgdGVtcGxhdGUuXG4gKiAtIEluc2lkZSBhbiBldmVudCBoYW5kbGVyLCByZXR1cm5zIHRoZSBkYXRhIGNvbnRleHQgb2YgdGhlIHRlbXBsYXRlIG9uIHdoaWNoXG4gKiB0aGlzIGV2ZW50IGhhbmRsZXIgd2FzIGRlZmluZWQuXG4gKiAtIEluc2lkZSBhIGhlbHBlciwgcmV0dXJucyB0aGUgZGF0YSBjb250ZXh0IG9mIHRoZSBET00gbm9kZSB3aGVyZSB0aGUgaGVscGVyXG4gKiB3YXMgdXNlZC5cbiAqXG4gKiBFc3RhYmxpc2hlcyBhIHJlYWN0aXZlIGRlcGVuZGVuY3kgb24gdGhlIHJlc3VsdC5cbiAqIEBsb2N1cyBDbGllbnRcbiAqIEBmdW5jdGlvblxuICogQGltcG9ydEZyb21QYWNrYWdlIHRlbXBsYXRpbmdcbiAqL1xuVGVtcGxhdGUuY3VycmVudERhdGEgPSBCbGF6ZS5nZXREYXRhO1xuXG4vKipcbiAqIEBzdW1tYXJ5IEFjY2Vzc2VzIG90aGVyIGRhdGEgY29udGV4dHMgdGhhdCBlbmNsb3NlIHRoZSBjdXJyZW50IGRhdGEgY29udGV4dC5cbiAqIEBsb2N1cyBDbGllbnRcbiAqIEBmdW5jdGlvblxuICogQHBhcmFtIHtJbnRlZ2VyfSBbbnVtTGV2ZWxzXSBUaGUgbnVtYmVyIG9mIGxldmVscyBiZXlvbmQgdGhlIGN1cnJlbnQgZGF0YSBjb250ZXh0IHRvIGxvb2suIERlZmF1bHRzIHRvIDEuXG4gKiBAaW1wb3J0RnJvbVBhY2thZ2UgdGVtcGxhdGluZ1xuICovXG5UZW1wbGF0ZS5wYXJlbnREYXRhID0gQmxhemUuX3BhcmVudERhdGE7XG5cbi8qKlxuICogQHN1bW1hcnkgRGVmaW5lcyBhIFtoZWxwZXIgZnVuY3Rpb25dKCNUZW1wbGF0ZS1oZWxwZXJzKSB3aGljaCBjYW4gYmUgdXNlZCBmcm9tIGFsbCB0ZW1wbGF0ZXMuXG4gKiBAbG9jdXMgQ2xpZW50XG4gKiBAZnVuY3Rpb25cbiAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lIFRoZSBuYW1lIG9mIHRoZSBoZWxwZXIgZnVuY3Rpb24geW91IGFyZSBkZWZpbmluZy5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bmN0aW9uIFRoZSBoZWxwZXIgZnVuY3Rpb24gaXRzZWxmLlxuICogQGltcG9ydEZyb21QYWNrYWdlIHRlbXBsYXRpbmdcbiAqL1xuVGVtcGxhdGUucmVnaXN0ZXJIZWxwZXIgPSBCbGF6ZS5yZWdpc3RlckhlbHBlcjtcblxuLyoqXG4gKiBAc3VtbWFyeSBSZW1vdmVzIGEgZ2xvYmFsIFtoZWxwZXIgZnVuY3Rpb25dKCNUZW1wbGF0ZS1oZWxwZXJzKS5cbiAqIEBsb2N1cyBDbGllbnRcbiAqIEBmdW5jdGlvblxuICogQHBhcmFtIHtTdHJpbmd9IG5hbWUgVGhlIG5hbWUgb2YgdGhlIGhlbHBlciBmdW5jdGlvbiB5b3UgYXJlIGRlZmluaW5nLlxuICogQGltcG9ydEZyb21QYWNrYWdlIHRlbXBsYXRpbmdcbiAqL1xuVGVtcGxhdGUuZGVyZWdpc3RlckhlbHBlciA9IEJsYXplLmRlcmVnaXN0ZXJIZWxwZXI7XG4iLCJVSSA9IEJsYXplO1xuXG5CbGF6ZS5SZWFjdGl2ZVZhciA9IFJlYWN0aXZlVmFyO1xuVUkuX3RlbXBsYXRlSW5zdGFuY2UgPSBCbGF6ZS5UZW1wbGF0ZS5pbnN0YW5jZTtcblxuSGFuZGxlYmFycyA9IHt9O1xuSGFuZGxlYmFycy5yZWdpc3RlckhlbHBlciA9IEJsYXplLnJlZ2lzdGVySGVscGVyO1xuXG5IYW5kbGViYXJzLl9lc2NhcGUgPSBCbGF6ZS5fZXNjYXBlO1xuXG4vLyBSZXR1cm4gdGhlc2UgZnJvbSB7ey4uLn19IGhlbHBlcnMgdG8gYWNoaWV2ZSB0aGUgc2FtZSBhcyByZXR1cm5pbmdcbi8vIHN0cmluZ3MgZnJvbSB7e3suLi59fX0gaGVscGVyc1xuSGFuZGxlYmFycy5TYWZlU3RyaW5nID0gZnVuY3Rpb24oc3RyaW5nKSB7XG4gIHRoaXMuc3RyaW5nID0gc3RyaW5nO1xufTtcbkhhbmRsZWJhcnMuU2FmZVN0cmluZy5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIHRoaXMuc3RyaW5nLnRvU3RyaW5nKCk7XG59O1xuIl19
