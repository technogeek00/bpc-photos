(function() {
  var CSS_CLASS_DELIM, HANDLER_NAME, QuickdrawError, VirtualDomNode, cleanup, dispatchEvent, exports, initialize, qd, qdInternal, registerGlobalHandler, registerLocalHandler,
    slice = [].slice,
    indexOf = [].indexOf || function(item) { for (var i = 0, l = this.length; i < l; i++) { if (i in this && this[i] === item) return i; } return -1; },
    hasProp = {}.hasOwnProperty;

  qd = {};

  if (typeof window !== "undefined" && window !== null) {
    if (window.qd != null) {
      throw new Error("Quickdraw already defined on `window` - this probably isn't what you want. Check your `node_modules/` directory for multiple copies of quickdrawjs.");
    } else {
      window['qd'] = qd;
    }
  } else {
    if (this.qd != null) {
      throw new Error("Quickdraw already defined in current scope - this probably isn't what you want. Check your `node_modules/` directory for multiple copies of quickdrawjs.");
    } else {
      this.qd = qd;
    }
  }

  if (typeof module !== "undefined" && module !== null) {
    exports = module.exports = qd;
  } else if (exports != null) {
    exports.qd = qd;
  } else {
    if ((typeof define !== "undefined" && define !== null) && define.amd) {
      define(function() {
        return qd;
      });
    }
  }

  qd._ = qdInternal = {
    config: {
      bindingAttribute: 'data-bind',
      maxQueuedUpdates: 25,
      updatesEnabled: true,
      updatesAsync: true,
      renderEnabled: true,
      renderAsync: true,
      defaultUpdateTimeout: 50,
      baseModelKey: 'base-view-model',
      nodeDataKey: '_qdData',
      defaultCacheSize: -1
    },
    state: {
      current: {
        model: null,
        element: null,
        handler: null
      },
      binding: {
        functions: {},
        handlers: {},
        order: []
      },
      error: {
        handlers: []
      },
      updates: {
        key: null,
        immediate: false,
        queue: []
      },
      render: {
        key: null,
        enqueuedNodes: {},
        queue: []
      },
      templates: {
        cache: null,
        nodes: {},
        aliases: {},
        html: {}
      }
    },
    updateCurrentState: function(updates) {
      var key, oldValues, value;
      if (updates == null) {
        updates = {};
      }
      oldValues = {};
      for (key in updates) {
        value = updates[key];
        oldValues[key] = qdInternal.state.current[key];
        qdInternal.state.current[key] = value;
      }
      return function() {
        var results;
        results = [];
        for (key in oldValues) {
          value = oldValues[key];
          results.push(qdInternal.state.current[key] = value);
        }
        return results;
      };
    }
  };

  qd.setConfig = function(configName, configValue) {
    qdInternal.config[configName] = configValue;
  };

  qd.getConfig = function(configName) {
    var ref;
    return (ref = qdInternal.config[configName]) != null ? ref : null;
  };

  qdInternal.async = {
    immediate: function(callback) {
      return qdInternal.async.delayed(callback);
    },
    delayed: function(callback, time) {
      var wrappedCallback;
      if (time == null) {
        time = 0;
      }
      wrappedCallback = function() {
        var err;
        try {
          return callback();
        } catch (error1) {
          err = error1;
          return qdInternal.errors["throw"](new QuickdrawError('Error occurred on async callback', err));
        }
      };
      return setTimeout(wrappedCallback, time);
    },
    cancel: function(timerId) {
      clearTimeout(timerId);
    }
  };

  qdInternal.binding = {
    getBindingFunction: function(node) {
      var bindingFunction, bindingString, err, error, functionBody, toParse;
      if ((node != null ? node.getAttribute : void 0) == null) {
        return null;
      }
      bindingString = node.getAttribute(qd.getConfig('bindingAttribute'));
      if (bindingString == null) {
        return null;
      }
      if (qdInternal.state.binding.functions[bindingString] == null) {
        toParse = bindingString;
        if (bindingString.trim()[0] !== '{') {
          toParse = '{' + toParse + '}';
        }
        toParse = toParse.replace(/(with|if)\s*:/g, '\'$1\' :');
        functionBody = 'with($context) {' + '    with($data) {' + '        return ' + toParse + '    }' + '}';
        bindingFunction = null;
        try {
          bindingFunction = new Function('$context', '$element', functionBody);
        } catch (error1) {
          err = error1;
          error = new QuickdrawError("Error in parsing binding '" + toParse + "', " + err.message);
          error.setOriginalError(err);
          error.setDomNode(node);
          return qdInternal.errors["throw"](error);
        }
        qdInternal.state.binding.functions[bindingString] = bindingFunction;
      }
      return qdInternal.state.binding.functions[bindingString];
    },
    getEvaluatedBindingObject: function(domNode, bindingContext) {
      var bindingFunction, err, error;
      bindingFunction = this.getBindingFunction(domNode);
      if (bindingFunction == null) {
        return null;
      }
      try {
        return bindingFunction(bindingContext, qdInternal.dom.unwrap(domNode));
      } catch (error1) {
        err = error1;
        error = new QuickdrawError("'" + err.message + "' in binding '" + (domNode.getAttribute(qd.getConfig('bindingAttribute'))) + "'", err);
        error.setBindingContext(bindingContext);
        error.setDomNode(domNode);
        qdInternal.errors["throw"](error);
        return null;
      }
    },
    bindModel: function(viewModel, domRoot, context) {
      var error, stateMemento;
      if (viewModel == null) {
        return qdInternal.errors["throw"](new QuickdrawError('Attempting binding of a null View Model'));
      }
      if (domRoot == null) {
        return qdInternal.errors["throw"](new QuickdrawError('Attempting to bind to a null Dom Root'));
      }
      if (context == null) {
        return qdInternal.errors["throw"](new QuickdrawError('Attempting binding with a null context'));
      }
      if (!qdInternal.models.isModel(viewModel)) {
        return qdInternal.errors["throw"](new QuickdrawError('Internal binding called with non-qd view model, must use models.create'));
      }
      domRoot = qdInternal.dom.virtualize(domRoot);
      qdInternal.models.setParent(viewModel, qdInternal.state.current.model);
      stateMemento = qdInternal.updateCurrentState({
        model: viewModel
      });
      this.bindDomTree(domRoot, context);
      if (viewModel !== qdInternal.state.current.model) {
        error = new QuickdrawError('After updating view, view model and applying bindings no longer match');
        error.setBindingContext(context);
        error.setDomNode(domRoot);
        error.setViewModel(viewModel);
        qdInternal.errors["throw"](error);
      }
      stateMemento();
    },
    bindDomTree: function(domRoot, bindingContext) {
      var child, j, len, ref;
      if (this.bindDomNode(domRoot, bindingContext)) {
        ref = domRoot.getChildren();
        for (j = 0, len = ref.length; j < len; j++) {
          child = ref[j];
          this.bindDomTree(child, bindingContext);
        }
      }
    },
    bindDomNode: function(domNode, bindingContext) {
      var bindingObject, handlers, initialize, j, len, name, ref, shouldContinue, stateMemento;
      shouldContinue = true;
      stateMemento = qdInternal.updateCurrentState({
        element: domNode,
        handler: null
      });
      bindingObject = this.getEvaluatedBindingObject(domNode, bindingContext);
      if (bindingObject == null) {
        stateMemento();
        return shouldContinue;
      }
      handlers = {};
      ref = qdInternal.state.binding.order;
      for (j = 0, len = ref.length; j < len; j++) {
        name = ref[j];
        if (!bindingObject.hasOwnProperty(name)) {
          continue;
        }
        initialize = qdInternal.handlers.getInitialize(name);
        if (typeof initialize === "function") {
          initialize(bindingObject[name], domNode, bindingContext);
        }
        handlers[name] = true;
      }
      qdInternal.storage.setInternalValue(domNode, 'handlers', handlers);
      shouldContinue = this.updateDomNode(domNode, bindingContext, bindingObject);
      stateMemento();
      return shouldContinue;
    },
    updateDomNode: function(domNode, bindingContext, bindingObject) {
      var handler, handlers, j, len, ref, ref1, shouldContinue, stateMemento, update;
      if (bindingObject == null) {
        bindingObject = null;
      }
      shouldContinue = true;
      stateMemento = qdInternal.updateCurrentState({
        element: domNode,
        handler: null
      });
      if (bindingObject == null) {
        bindingObject = this.getEvaluatedBindingObject(domNode, bindingContext);
      }
      if (bindingObject == null) {
        stateMemento();
        return shouldContinue;
      }
      handlers = qdInternal.storage.getInternalValue(domNode, 'handlers');
      ref = qdInternal.state.binding.order;
      for (j = 0, len = ref.length; j < len; j++) {
        handler = ref[j];
        if (!handlers.hasOwnProperty(handler)) {
          continue;
        }
        update = qdInternal.handlers.getUpdate(handler);
        shouldContinue = ((ref1 = typeof update === "function" ? update(bindingObject[handler], domNode, bindingContext) : void 0) != null ? ref1 : true) && shouldContinue;
        handlers[handler] = false;
      }
      stateMemento();
      return shouldContinue;
    },
    unbindDomTree: function(domNode) {
      var boundHandlers, child, cleanup, handler, j, k, l, len, len1, observable, observables, ref, ref1, ref2, ref3;
      domNode = qdInternal.dom.virtualize(domNode);
      observables = (ref = qdInternal.storage.getInternalValue(domNode, 'observables')) != null ? ref : [];
      for (j = 0, len = observables.length; j < len; j++) {
        observable = observables[j];
        qdInternal.observables.removeDependency.call(observable, domNode);
      }
      boundHandlers = (ref1 = qdInternal.storage.getInternalValue(domNode, 'handlers')) != null ? ref1 : {};
      ref2 = qdInternal.state.binding.order;
      for (k = ref2.length - 1; k >= 0; k += -1) {
        handler = ref2[k];
        if (!boundHandlers.hasOwnProperty(handler)) {
          continue;
        }
        cleanup = qdInternal.handlers.getCleanup(handler);
        if (typeof cleanup === "function") {
          cleanup(domNode);
        }
      }
      domNode.clearValues();
      ref3 = domNode.getChildren();
      for (l = 0, len1 = ref3.length; l < len1; l++) {
        child = ref3[l];
        this.unbindDomTree(child);
      }
    }
  };

  qd.bindModel = function(viewModel, domRoot) {
    var baseContext;
    if (viewModel == null) {
      return qdInternal.errors["throw"](new QuickdrawError("Bind model called with null view model"));
    }
    viewModel = qdInternal.models.create(viewModel);
    baseContext = qdInternal.context.create(viewModel);
    qdInternal.binding.bindModel(viewModel, domRoot, baseContext);
    qdInternal.templates.clearCache();
    qdInternal.renderer.schedule();
  };

  qd.unbindModel = function(domRoot) {
    if (domRoot == null) {
      return;
    }
    qdInternal.binding.unbindDomTree(domRoot);
  };

  qdInternal.cache = {
    create: function(generator, cacheSize) {
      if (cacheSize == null) {
        cacheSize = qd.getConfig('defaultCacheSize');
      }
      return {
        _cache: {},
        get: function() {
          var args, id, ref, ref1;
          id = arguments[0], args = 2 <= arguments.length ? slice.call(arguments, 1) : [];
          if (((ref = (ref1 = this._cache[id]) != null ? ref1.length : void 0) != null ? ref : 0) === 0) {
            return generator.apply(null, [id].concat(slice.call(args)));
          }
          return this._cache[id].shift();
        },
        put: function(id, object) {
          var base;
          if ((base = this._cache)[id] == null) {
            base[id] = [];
          }
          if (this._cache[id].length < cacheSize || cacheSize === -1) {
            this._cache[id].push(object);
          }
        },
        clear: function() {
          this._cache = {};
        }
      };
    }
  };

  qdInternal.context = {
    create: function(viewModel) {
      var current, extend, parent, parentModels, parents, ref, ref1, ref2, ref3;
      if (viewModel.__context != null) {
        return viewModel.__context;
      }
      extend = function(child) {
        var rawChildModel;
        child = qdInternal.models.create(child);
        rawChildModel = qdInternal.models.unwrap(child);
        child.__context = {
          $data: qd.unwrapObservable(rawChildModel),
          $rawData: rawChildModel,
          $parents: [this.$data].concat(this.$parents),
          $parent: this.$data,
          $parentContext: this,
          $root: this.$root,
          $extend: extend
        };
        return child.__context;
      };
      parents = [];
      parentModels = [];
      current = viewModel;
      while ((parent = qdInternal.models.getParent(current)) != null) {
        parentModels.push(parent);
        parents.push(parent.raw);
        current = parent;
      }
      viewModel.__context = {
        $data: qd.unwrapObservable(viewModel.raw),
        $rawData: viewModel.raw,
        $parents: parents,
        $parent: (ref = parents[0]) != null ? ref : null,
        $parentContext: (ref1 = (ref2 = parentModels[0]) != null ? ref2.__context : void 0) != null ? ref1 : null,
        $root: qd.unwrapObservable((ref3 = parents[parents.length - 1]) != null ? ref3 : viewModel.raw),
        $extend: extend
      };
      return viewModel.__context;
    },
    get: function(domNode) {
      var baseViewModel;
      baseViewModel = qdInternal.storage.getInternalValue(domNode, qd.getConfig('baseModelKey'));
      if (baseViewModel == null) {
        return null;
      }
      return this.create(baseViewModel);
    },
    set: function(domNode, context) {
      qdInternal.storage.setInternalValue(domNode, qd.getConfig('baseModelKey'), context);
    }
  };

  qdInternal.dom = {
    _uniqueIdentifier: 0,
    uniqueId: function(node) {
      if (qdInternal.storage.getInternalValue(node, 'id') == null) {
        qdInternal.storage.setInternalValue(node, 'id', ++this._uniqueIdentifier);
      }
      return qdInternal.storage.getInternalValue(node, 'id');
    },
    virtualize: function(domNode) {
      var ref;
      if (domNode instanceof qdInternal.dom.VirtualDomNode) {
        return domNode;
      }
      return (ref = qdInternal.storage.getInternalValue(domNode, 'virtual')) != null ? ref : new qdInternal.dom.VirtualDomNode(domNode);
    },
    unwrap: function(domNode) {
      if (domNode == null) {
        return null;
      }
      if (domNode instanceof qdInternal.dom.VirtualDomNode) {
        return domNode.getRawNode();
      } else {
        return domNode;
      }
    },
    importNode: function(document, node, deep) {
      var virtualNode;
      if (deep == null) {
        deep = true;
      }
      virtualNode = qdInternal.dom.virtualize(node);
      return virtualNode.cloneNode(deep, document);
    },
    getNodePath: function(domNode) {
      var className, id, nodePath;
      nodePath = [];
      while (domNode != null) {
        domNode = this.virtualize(domNode);
        id = domNode.getProperty('id') && ("#" + (domNode.getProperty('id')));
        className = domNode.getProperty('className') && ("." + (domNode.getProperty('className').replace(" ", ".")));
        nodePath.push("" + (domNode.getProperty('tagName').toLowerCase()) + id + className);
        domNode = domNode.getParentNode();
      }
      return nodePath.reverse();
    },
    VirtualDomNode: VirtualDomNode = (function() {
      var uniqueIds;

      uniqueIds = 0;

      function VirtualDomNode(domNode) {
        this._changes = {
          properties: null,
          attributes: null,
          styles: null,
          children: null
        };
        this._state = {
          id: uniqueIds++,
          rawNode: domNode,
          hasModifications: false,
          templateName: null
        };
        qdInternal.storage.setInternalValue(domNode, 'virtual', this);
        qdInternal.eventing.add(this);
        this._resetChangeState();
      }

      VirtualDomNode.prototype.dispose = function() {
        var child, j, len, ref, ref1;
        ref1 = (ref = this._changes.children) != null ? ref : [];
        for (j = 0, len = ref1.length; j < len; j++) {
          child = ref1[j];
          child.dispose();
        }
        this._resetChangeState();
        this._changes = null;
        qdInternal.storage.setInternalValue(this._state.rawNode, 'virtual', null);
        return delete this._state.rawNode;
      };

      VirtualDomNode.prototype.getUniqueId = function() {
        return this._state.id;
      };

      VirtualDomNode.prototype.getRawNode = function() {
        return this._state.rawNode;
      };

      VirtualDomNode.prototype.generatePatch = function() {
        var patchSet;
        if (!this._state.hasModifications) {
          return null;
        }
        patchSet = {
          node: this._state.rawNode,
          properties: this._changes.properties,
          attributes: this._changes.attributes,
          styles: this._changes.styles,
          children: this._generateChildrenActions()
        };
        this._resetChangeState();
        return patchSet;
      };

      VirtualDomNode.prototype.getParentNode = function() {
        var rawNode;
        if (!this._state.hasOwnProperty('parent')) {
          rawNode = this._state.rawNode;
          if ((rawNode.parentNode != null) && rawNode.parentNode !== rawNode.ownerDocument) {
            this._state.parent = qdInternal.dom.virtualize(rawNode.parentNode);
          } else {
            this._state.parent = null;
          }
        }
        return this._state.parent;
      };

      VirtualDomNode.prototype.setParentNode = function(virtualNode, removeFromOldParent) {
        var curParent;
        if (removeFromOldParent == null) {
          removeFromOldParent = true;
        }
        if ((virtualNode != null) && !(virtualNode instanceof VirtualDomNode)) {
          qdInternal.errors["throw"](new QuickdrawError("Attempting to set non-virtual node to parent of a virtual node"));
        }
        curParent = this.getParentNode();
        if (virtualNode === curParent) {
          return;
        }
        if (removeFromOldParent) {
          if (curParent != null) {
            curParent.removeChild(this);
          }
        }
        return this._state.parent = virtualNode;
      };

      VirtualDomNode.prototype.getTemplateName = function() {
        return this._state.templateName;
      };

      VirtualDomNode.prototype.setTemplateName = function(templateName) {
        return this._state.templateName = templateName;
      };

      VirtualDomNode.prototype.getValue = function(key, namespace) {
        return qdInternal.storage.getValue(this._state.rawNode, key, namespace);
      };

      VirtualDomNode.prototype.setValue = function(key, value, namespace) {
        qdInternal.storage.setValue(this._state.rawNode, key, value, namespace);
      };

      VirtualDomNode.prototype.clearValues = function() {
        qdInternal.storage.clearValues(this._state.rawNode);
        qdInternal.storage.setInternalValue(this._state.rawNode, 'virtual', this);
      };

      VirtualDomNode.prototype.getProperty = function(name) {
        var ref, ref1;
        return (ref = (ref1 = this._changes.properties) != null ? ref1[name] : void 0) != null ? ref : this._state.rawNode[name];
      };

      VirtualDomNode.prototype.setProperty = function(name, value) {
        var base;
        this._changeWillOccur();
        if ((base = this._changes).properties == null) {
          base.properties = {};
        }
        this._changes.properties[name] = value;
      };

      VirtualDomNode.prototype.getAttribute = function(name) {
        var ref;
        if ((ref = this._changes.attributes) != null ? ref.hasOwnProperty(name) : void 0) {
          return this._changes.attributes[name];
        }
        return this._state.rawNode.getAttribute(name);
      };

      VirtualDomNode.prototype.setAttribute = function(name, value) {
        var base;
        this._changeWillOccur();
        if ((base = this._changes).attributes == null) {
          base.attributes = {};
        }
        this._changes.attributes[name] = value;
      };

      VirtualDomNode.prototype.removeAttribute = function(name) {
        var base;
        this._changeWillOccur();
        if ((base = this._changes).attributes == null) {
          base.attributes = {};
        }
        this._changes.attributes[name] = null;
      };

      VirtualDomNode.prototype.hasAttribute = function(name) {
        var ref;
        if ((ref = this._changes.attributes) != null ? ref.hasOwnProperty(name) : void 0) {
          return this._changes.attributes[name] != null;
        }
        return this._state.rawNode.hasAttribute(name);
      };

      VirtualDomNode.prototype.getStyle = function(name) {
        var ref, ref1;
        return (ref = (ref1 = this._changes.styles) != null ? ref1[name] : void 0) != null ? ref : this._state.rawNode.style[name];
      };

      VirtualDomNode.prototype.setStyle = function(name, value) {
        var base;
        this._changeWillOccur();
        if ((base = this._changes).styles == null) {
          base.styles = {};
        }
        this._changes.styles[name] = value;
      };

      VirtualDomNode.prototype.addEventListener = function() {
        var args, ref;
        args = 1 <= arguments.length ? slice.call(arguments, 0) : [];
        return (ref = this._state.rawNode).addEventListener.apply(ref, args);
      };

      VirtualDomNode.prototype.removeEventListener = function() {
        var args, ref;
        args = 1 <= arguments.length ? slice.call(arguments, 0) : [];
        return (ref = this._state.rawNode).removeEventListener.apply(ref, args);
      };

      VirtualDomNode.prototype.getChildren = function(copy) {
        if (copy == null) {
          copy = false;
        }
        this._generateVirtualChildren();
        if (!copy) {
          return this._changes.children;
        }
        return this._changes.children.slice();
      };

      VirtualDomNode.prototype.isChild = function(child) {
        var virtualChild;
        this._generateVirtualChildren();
        virtualChild = qdInternal.dom.virtualize(child);
        return (indexOf.call(this._changes.children, virtualChild) >= 0);
      };

      VirtualDomNode.prototype.removeChild = function(child) {
        var index, virtualChild;
        this._generateVirtualChildren();
        this._changeWillOccur();
        virtualChild = qdInternal.dom.virtualize(child);
        index = this._changes.children.indexOf(virtualChild);
        if (index === -1) {
          return qdInternal.errors["throw"](new QuickdrawError("Given element is not a child of this node"));
        }
        this._changes.children.splice(index, 1);
        virtualChild.setParentNode(null, false);
        return virtualChild;
      };

      VirtualDomNode.prototype.appendChild = function(child) {
        var index, virtualChild;
        this._generateVirtualChildren();
        this._changeWillOccur();
        virtualChild = qdInternal.dom.virtualize(child);
        index = this._changes.children.indexOf(virtualChild);
        if (index !== -1) {
          if (index === this._changes.children.length - 1) {
            return virtualChild;
          }
          this._changes.children.splice(index, 1);
        }
        this._changes.children.push(virtualChild);
        virtualChild.setParentNode(this);
        return virtualChild;
      };

      VirtualDomNode.prototype.insertBefore = function(child, referenceNode) {
        var childIndex, referenceIndex, virtualChild, virtualReference;
        this._generateVirtualChildren();
        this._changeWillOccur();
        if (referenceNode == null) {
          return this.appendChild(child);
        }
        virtualChild = qdInternal.dom.virtualize(child);
        virtualReference = qdInternal.dom.virtualize(referenceNode);
        childIndex = this._changes.children.indexOf(virtualChild);
        referenceIndex = this._changes.children.indexOf(virtualReference);
        if (referenceIndex === -1) {
          return qdInternal.errors["throw"](new QuickdrawError("Reference node is not a child of this node"));
        }
        if (childIndex !== -1) {
          if (childIndex + 1 === referenceIndex) {
            return virtualChild;
          }
          this._changes.children.splice(childIndex, 1);
          referenceIndex = this._changes.children.indexOf(virtualReference);
        }
        this._changes.children.splice(referenceIndex, 0, virtualChild);
        virtualChild.setParentNode(this);
        return virtualChild;
      };

      VirtualDomNode.prototype.clearChildren = function() {
        var child, j, len, ref;
        this._generateVirtualChildren();
        this._changeWillOccur();
        ref = this._changes.children;
        for (j = 0, len = ref.length; j < len; j++) {
          child = ref[j];
          child.setParentNode(null, false);
        }
        this._changes.children.length = 0;
      };

      VirtualDomNode.prototype.setChildren = function(children) {
        var child, j, len, virtualChild;
        this.clearChildren();
        for (j = 0, len = children.length; j < len; j++) {
          child = children[j];
          virtualChild = qdInternal.dom.virtualize(child);
          virtualChild.setParentNode(this);
          this._changes.children.push(virtualChild);
        }
      };

      VirtualDomNode.prototype.cloneNode = function(deep, document) {
        var attribute, changedProperty, child, copy, i, j, len, newChild, property, ref, ref1, ref2, ref3, style, value, virtualCopy;
        if (deep == null) {
          deep = true;
        }
        if (document == null) {
          document = this._state.rawNode.ownerDocument;
        }
        if (document === this._state.rawNode.ownerDocument) {
          copy = this._state.rawNode.cloneNode(false);
        } else {
          copy = document.importNode(this._state.rawNode, false);
        }
        virtualCopy = qdInternal.dom.virtualize(copy);
        changedProperty = false;
        if (this._changes.properties != null) {
          virtualCopy._changes.properties = {};
          ref = this._changes.properties;
          for (property in ref) {
            value = ref[property];
            changedProperty = true;
            virtualCopy._changes.properties[property] = value;
          }
        }
        if (this._changes.attributes != null) {
          virtualCopy._changes.attributes = {};
          ref1 = this._changes.attributes;
          for (attribute in ref1) {
            value = ref1[attribute];
            changedProperty = true;
            virtualCopy._changes.attributes[attribute] = value;
          }
        }
        if (this._changes.styles != null) {
          virtualCopy._changes.styles = {};
          ref2 = this._changes.styles;
          for (style in ref2) {
            value = ref2[style];
            changedProperty = true;
            virtualCopy._changes.styles[style] = value;
          }
        }
        if (changedProperty) {
          virtualCopy._changeWillOccur();
        }
        if (deep) {
          this._generateVirtualChildren();
          ref3 = this._changes.children;
          for (i = j = 0, len = ref3.length; j < len; i = ++j) {
            child = ref3[i];
            newChild = child.cloneNode(true, document);
            copy.appendChild(newChild.getRawNode());
          }
          virtualCopy.getChildren();
        }
        return virtualCopy;
      };

      VirtualDomNode.prototype._resetChangeState = function() {
        this._state.hasModifications = false;
        delete this._state.parent;
        this._changes.properties = null;
        this._changes.attributes = null;
        this._changes.styles = null;
        this._changes.children = null;
      };

      VirtualDomNode.prototype._changeWillOccur = function() {
        if (!this._state.hasModifications) {
          this._state.hasModifications = true;
          qdInternal.renderer.enqueue(this);
        }
      };

      VirtualDomNode.prototype._generateVirtualChildren = function() {
        var child, j, len, ref, virtualChild;
        if (this._changes.children != null) {
          return;
        }
        this._changes.children = [];
        ref = this._state.rawNode.children;
        for (j = 0, len = ref.length; j < len; j++) {
          child = ref[j];
          virtualChild = qdInternal.dom.virtualize(child);
          virtualChild.setParentNode(this);
          this._changes.children.push(virtualChild);
        }
      };

      VirtualDomNode.prototype._generateChildrenActions = function() {
        var actions, actionsBackward, actionsForward, arrayBackward, arrayForward, child, correctIndex, curIndex, currentChildren, expectedChildren, i, index, j, k, l, len, len1, len2, len3, m, map, mappingArray, n, prunedChildren, ref, ref1, ref2, ref3, value;
        if (this._changes.children == null) {
          return [];
        }
        currentChildren = this._state.rawNode.children;
        expectedChildren = new Array(this._changes.children.length);
        ref = this._changes.children;
        for (i = j = 0, len = ref.length; j < len; i = ++j) {
          child = ref[i];
          expectedChildren[i] = child.getRawNode();
        }
        actions = [];
        prunedChildren = [];
        for (k = 0, len1 = currentChildren.length; k < len1; k++) {
          child = currentChildren[k];
          if (!(indexOf.call(expectedChildren, child) >= 0)) {
            actions.push({
              type: "remove",
              value: child
            });
          } else {
            prunedChildren.push(child);
          }
        }
        mappingArray = new Array(expectedChildren.length);
        for (index = l = 0, len2 = expectedChildren.length; l < len2; index = ++l) {
          value = expectedChildren[index];
          mappingArray[index] = {
            leads: (ref1 = expectedChildren[index + 1]) != null ? ref1 : null,
            follows: (ref2 = expectedChildren[index - 1]) != null ? ref2 : null,
            value: value
          };
        }
        actionsForward = actions;
        arrayForward = prunedChildren;
        actionsBackward = actions.slice();
        arrayBackward = prunedChildren.slice();
        for (index = m = 0, len3 = mappingArray.length; m < len3; index = m += 1) {
          map = mappingArray[index];
          curIndex = arrayForward.indexOf(map.value);
          if (curIndex === index) {
            continue;
          }
          if (curIndex !== -1) {
            arrayForward.splice(curIndex, 1);
          }
          actionsForward.push({
            type: "insert",
            value: map.value,
            follows: map.follows
          });
          arrayForward.splice(index, 0, map.value);
        }
        for (index = n = 0, ref3 = mappingArray.length; 0 <= ref3 ? n < ref3 : n > ref3; index = 0 <= ref3 ? ++n : --n) {
          map = mappingArray[mappingArray.length - 1 - index];
          curIndex = arrayBackward.indexOf(map.value);
          correctIndex = Math.max(0, arrayBackward.length - 1 - index);
          if (correctIndex === curIndex) {
            continue;
          }
          if (curIndex !== -1) {
            arrayBackward.splice(curIndex, 1);
          }
          if (map.leads === null) {
            correctIndex = arrayBackward.length;
          } else {
            correctIndex = arrayBackward.indexOf(map.leads);
          }
          actionsBackward.push({
            type: "insert",
            value: map.value,
            leads: map.leads
          });
          arrayBackward.splice(correctIndex, 0, map.value);
        }
        if (actionsForward.length > actionsBackward.length) {
          return actionsBackward;
        } else {
          return actionsForward;
        }
      };

      return VirtualDomNode;

    })()
  };

  qdInternal.errors = {
    "throw": function(error) {
      var handler, j, len, ref;
      if (qdInternal.state.error.handlers.length === 0) {
        throw error;
      }
      ref = qdInternal.state.error.handlers;
      for (j = 0, len = ref.length; j < len; j++) {
        handler = ref[j];
        handler(error);
      }
    }
  };

  qdInternal.errors.QuickdrawError = QuickdrawError = (function() {
    function QuickdrawError(message, originalError) {
      var ref, ref1, ref2;
      this.message = message;
      this._current = {
        nodePath: null,
        duringBinding: qdInternal.state.current.element !== null,
        error: originalError,
        context: null,
        observable: null,
        domNode: qdInternal.dom.unwrap((ref = qdInternal.state.current.element) != null ? ref : null),
        handler: (ref1 = qdInternal.state.current.handler) != null ? ref1 : null,
        viewModel: (ref2 = qdInternal.models.unwrap(qdInternal.state.current.model)) != null ? ref2 : null
      };
    }

    QuickdrawError.prototype.setOriginalError = function(error) {
      this._current.error = error;
    };

    QuickdrawError.prototype.setBindingContext = function(context) {
      this._current.context = context;
    };

    QuickdrawError.prototype.setDomNode = function(domNode) {
      this._current.domNode = qdInternal.dom.unwrap(domNode);
      this.setNodePath(qdInternal.dom.getNodePath(domNode));
    };

    QuickdrawError.prototype.setObservable = function(observable) {
      this._current.observable = observable;
    };

    QuickdrawError.prototype.setViewModel = function(viewModel) {
      if (viewModel == null) {
        return;
      }
      this._current.viewModel = qdInternal.models.unwrap(viewModel);
    };

    QuickdrawError.prototype.setNodePath = function(nodePath) {
      this._current.nodePath = nodePath;
    };

    QuickdrawError.prototype.errorInfo = function() {
      return this._current;
    };

    return QuickdrawError;

  })();

  qd.registerErrorHandler = function(callback) {
    qdInternal.state.error.handlers.push(callback);
  };

  qdInternal.eventing = {
    _on: function(eventType, callback) {
      var registrations;
      registrations = this.__eventRegistrations != null ? this.__eventRegistrations : this.__eventRegistrations = {};
      if (registrations[eventType] == null) {
        registrations[eventType] = [];
      }
      registrations[eventType].push(callback);
    },
    _once: function(eventType, callback) {
      var wrappedCallback;
      wrappedCallback = (function(_this) {
        return function() {
          var args;
          args = 1 <= arguments.length ? slice.call(arguments, 0) : [];
          callback.apply(_this, arguments);
          return _this.removeListener(eventType, wrappedCallback);
        };
      })(this);
      this.on(eventType, wrappedCallback);
    },
    _removeListener: function(eventType, callback) {
      var reg, registrations;
      registrations = this.__eventRegistrations;
      if ((registrations != null ? registrations[eventType] : void 0) != null) {
        registrations[eventType] = (function() {
          var j, len, ref, results;
          ref = registrations[eventType];
          results = [];
          for (j = 0, len = ref.length; j < len; j++) {
            reg = ref[j];
            if (reg !== callback) {
              results.push(reg);
            }
          }
          return results;
        })();
      }
    },
    _emit: function(eventType, args, async) {
      var callbacks, emitCallback;
      if (async == null) {
        async = true;
      }
      if (!((this.__eventRegistrations != null) && (this.__eventRegistrations[eventType] != null))) {
        return;
      }
      callbacks = this.__eventRegistrations[eventType];
      emitCallback = (function(_this) {
        return function() {
          var callback, j, len;
          for (j = 0, len = callbacks.length; j < len; j++) {
            callback = callbacks[j];
            callback.apply(_this, args);
          }
        };
      })(this);
      if (async) {
        qdInternal.async.immediate(emitCallback);
      } else {
        emitCallback();
      }
    },
    add: function(obj) {
      var evt;
      evt = qdInternal.eventing;
      obj.on = evt._on;
      obj.once = evt._once;
      obj.removeListener = evt._removeListener;
      obj.emit = evt._emit;
      return obj;
    }
  };

  qdInternal.eventing.add(qd);

  qdInternal.handlers = {
    getInitialize: function(keyword) {
      var ref, ref1;
      return (ref = (ref1 = qdInternal.state.binding.handlers[keyword]) != null ? ref1.methods.initialize : void 0) != null ? ref : null;
    },
    getUpdate: function(keyword) {
      var ref, ref1;
      return (ref = (ref1 = qdInternal.state.binding.handlers[keyword]) != null ? ref1.methods.update : void 0) != null ? ref : null;
    },
    getCleanup: function(keyword) {
      var ref, ref1;
      return (ref = (ref1 = qdInternal.state.binding.handlers[keyword]) != null ? ref1.methods.cleanup : void 0) != null ? ref : null;
    },
    exists: function(keyword) {
      return qdInternal.state.binding.handlers[keyword] != null;
    }
  };

  qd.registerBindingHandler = function(keyword, handler, follows, override) {
    var dependencyCount, dependencyMap, handlerOrder, handlers, j, k, l, len, len1, len2, name, precursor, ref, ref1, ref2, ref3, toProcess, type, valid;
    if (follows == null) {
      follows = [];
    }
    if (override == null) {
      override = false;
    }
    if (!((keyword != null) && keyword.length > 0)) {
      return qdInternal.errors["throw"](new QuickdrawError("Binding handler must have a valid name"));
    }
    if (qdInternal.handlers.exists(keyword) && !override) {
      return qdInternal.errors["throw"](new QuickdrawError("Binding handler already registered for '" + keyword + "'"));
    }
    if (!((handler.initialize != null) || (handler.update != null))) {
      return qdInternal.errors["throw"](new QuickdrawError("A binding handler must at least specify an 'initialize'/'update' callback"));
    }
    ref = ['initialize', 'update', 'cleanup'];
    for (j = 0, len = ref.length; j < len; j++) {
      type = ref[j];
      if (handler[type] == null) {
        continue;
      }
      handler[type] = (function(type, callback) {
        return function() {
          var args, err, error, node, result, stateMemento;
          args = 1 <= arguments.length ? slice.call(arguments, 0) : [];
          stateMemento = qdInternal.updateCurrentState({
            handler: keyword
          });
          try {
            result = callback.apply(qdInternal, args);
          } catch (error1) {
            err = error1;
            if (type === 'initialize' || type === 'update') {
              node = args[1];
            } else {
              node = args[0];
            }
            error = new QuickdrawError("Error in '" + type + "' of '" + keyword + "' binding handler: \"" + err.message + "\"", err);
            error.setDomNode(node);
            qdInternal.errors["throw"](error);
          } finally {
            stateMemento();
          }
          return result;
        };
      })(type, handler[type]);
    }
    handlers = qdInternal.state.binding.handlers;
    handlers[keyword] = {
      methods: handler,
      follows: follows
    };
    toProcess = [];
    dependencyMap = {};
    dependencyCount = {};
    for (name in handlers) {
      handler = handlers[name];
      valid = 0;
      ref1 = handler.follows;
      for (k = 0, len1 = ref1.length; k < len1; k++) {
        precursor = ref1[k];
        if (handlers[precursor] == null) {
          continue;
        }
        if (dependencyMap[precursor] == null) {
          dependencyMap[precursor] = [];
        }
        dependencyMap[precursor].push(name);
        valid++;
      }
      if (valid === 0) {
        toProcess.push(name);
      } else {
        dependencyCount[name] = valid;
      }
    }
    handlerOrder = qdInternal.state.binding.order;
    handlerOrder.length = 0;
    while (toProcess.length > 0) {
      name = toProcess.shift();
      handlerOrder.push(name);
      ref3 = (ref2 = dependencyMap[name]) != null ? ref2 : [];
      for (l = 0, len2 = ref3.length; l < len2; l++) {
        handler = ref3[l];
        dependencyCount[handler]--;
        if (dependencyCount[handler] === 0) {
          toProcess.push(handler);
        }
      }
    }
    return handlers[keyword].methods;
  };

  qdInternal.models = {
    create: function(rawObject) {
      if (this.isModel(rawObject)) {
        return rawObject;
      }
      return {
        raw: rawObject,
        __isModel: true,
        __parent: null
      };
    },
    isModel: function(object) {
      return (object != null) && (object.__isModel != null) && object.__isModel;
    },
    get: function(domNode) {
      return qdInternal.storage.getInternalValue(domNode, qd.getConfig('baseModelKey'));
    },
    setParent: function(model, parent) {
      if (!this.isModel(model) || (parent == null) || model === parent) {
        return;
      }
      return model.__parent = parent;
    },
    getParent: function(model, parent) {
      if (!this.isModel(model)) {
        return null;
      }
      return model.__parent;
    },
    unwrap: function(model) {
      if (this.isModel(model)) {
        return model.raw;
      }
      return model;
    }
  };

  qd.getModel = function(domNode) {
    return qdInternal.models.unwrap(qdInternal.models.get(domNode));
  };

  qdInternal.observables = {
    addDependency: function(model, element, handler) {
      var dependencyObject, matchingElms, observables, ref;
      if (model == null) {
        model = qdInternal.state.current.model;
      }
      if (element == null) {
        element = qdInternal.state.current.element;
      }
      if (handler == null) {
        handler = qdInternal.state.current.handler;
      }
      if (!((model != null) && (element != null))) {
        return;
      }
      element = qdInternal.dom.unwrap(element);
      qdInternal.context.set(element, model);
      if (this.__dependencies == null) {
        this.__dependencies = [];
      }
      matchingElms = this.__dependencies.filter(function(elm) {
        return elm.domNode === element;
      });
      if (matchingElms.length > 0) {
        dependencyObject = matchingElms[0];
      } else {
        dependencyObject = {
          domNode: element,
          handlers: []
        };
        this.__dependencies.push(dependencyObject);
        this.emit('bound', [model, element]);
      }
      if (handler != null) {
        if (indexOf.call(dependencyObject.handlers, handler) < 0) {
          dependencyObject.handlers.push(handler);
        }
      } else {
        dependencyObject.unspecific = true;
      }
      observables = (ref = qdInternal.storage.getInternalValue(element, 'observables')) != null ? ref : [];
      if (indexOf.call(observables, this) < 0) {
        observables.push(this);
      }
      qdInternal.storage.setInternalValue(element, 'observables', observables);
    },
    addComputedDependency: function(computed) {
      if (this.__computedDependencies == null) {
        this.__computedDependencies = [];
      }
      if (indexOf.call(this.__computedDependencies, computed) < 0) {
        this.__computedDependencies.push(computed);
      }
    },
    getDependencies: function() {
      var computed, dependencies, j, len, ref, ref1, ref2;
      dependencies = (ref = this.__dependencies) != null ? ref : [];
      ref2 = (ref1 = this.__computedDependencies) != null ? ref1 : [];
      for (j = 0, len = ref2.length; j < len; j++) {
        computed = ref2[j];
        dependencies = dependencies.concat(qdInternal.observables.getDependencies.call(computed));
      }
      return dependencies;
    },
    removeDependency: function(element) {
      var dependency;
      element = qdInternal.dom.unwrap(element);
      this.__dependencies = (function() {
        var j, len, ref, results;
        ref = this.__dependencies;
        results = [];
        for (j = 0, len = ref.length; j < len; j++) {
          dependency = ref[j];
          if (dependency.domNode !== element) {
            results.push(dependency);
          }
        }
        return results;
      }).call(this);
      this.emit('unbound', [element]);
    },
    hasDependencies: function() {
      return qdInternal.observables.getDependencies.call(this).length > 0;
    },
    updateDependencies: function(immediate) {
      var dependencies, dependency, element, handler, handlers, immediateRebinds, j, k, len, len1, ref;
      if (immediate == null) {
        immediate = false;
      }
      dependencies = qdInternal.observables.getDependencies.call(this);
      if (!(dependencies.length > 0)) {
        return;
      }
      immediateRebinds = [];
      for (j = 0, len = dependencies.length; j < len; j++) {
        dependency = dependencies[j];
        element = dependency.domNode;
        handlers = qdInternal.storage.getInternalValue(element, 'handlers');
        if (!handlers) {
          continue;
        }
        if (dependency.unspecific) {
          for (handler in handlers) {
            handlers[handler] = true;
          }
        } else {
          ref = dependency.handlers;
          for (k = 0, len1 = ref.length; k < len1; k++) {
            handler = ref[k];
            handlers[handler] = true;
          }
        }
        if (immediate) {
          immediateRebinds.push(element);
        } else {
          qdInternal.updates.enqueue(element);
        }
      }
      if (immediate) {
        qdInternal.updates.updateNodeSet(immediateRebinds);
        qdInternal.renderer.render();
      } else {
        qdInternal.updates.schedule();
      }
      this.emit('set');
    },
    helpers: {
      immediate: function(newValue) {
        return this(newValue, true);
      },
      silent: function(newValue) {
        return this(newValue, false, false);
      },
      not: function(newValue, immediate, alertDependencies) {
        return !this(newValue, immediate, alertDependencies);
      },
      indexOf: function(find) {
        var i, item, j, len, ref;
        ref = this.value;
        for (i = j = 0, len = ref.length; j < len; i = ++j) {
          item = ref[i];
          if (item === find) {
            return i;
          }
        }
        return -1;
      },
      slice: function() {
        var ret;
        ret = this.value.slice.apply(this.value, arguments);
        qdInternal.observables.updateDependencies.call(this);
        return ret;
      },
      push: function(item) {
        this.value.push(item);
        qdInternal.observables.updateDependencies.call(this);
      },
      pop: function() {
        var ret;
        ret = this.value.pop();
        qdInternal.observables.updateDependencies.call(this);
        return ret;
      },
      unshift: function(item) {
        this.value.unshift(item);
        qdInternal.observables.updateDependencies.call(this);
      },
      shift: function() {
        var ret;
        ret = this.value.shift();
        qdInternal.observables.updateDependencies.call(this);
        return ret;
      },
      reverse: function() {
        this.value.reverse();
        qdInternal.observables.updateDependencies.call(this);
      },
      sort: function(func) {
        this.value.sort(func);
        qdInternal.observables.updateDependencies.call(this);
      },
      splice: function() {
        var count, elements, first, ref, ret;
        first = arguments[0], count = arguments[1], elements = 3 <= arguments.length ? slice.call(arguments, 2) : [];
        ret = (ref = this.value).splice.apply(ref, [first, count].concat(slice.call(elements)));
        qdInternal.observables.updateDependencies.call(this);
        return ret;
      },
      remove: function(find) {
        var drop, item, j, len, newBack, ref, ref1, removed;
        newBack = [];
        removed = [];
        ref = this.value;
        for (j = 0, len = ref.length; j < len; j++) {
          item = ref[j];
          drop = (ref1 = typeof find === "function" ? find(item) : void 0) != null ? ref1 : item === find;
          (drop ? removed : newBack).push(item);
        }
        this.value = newBack;
        qdInternal.observables.updateDependencies.call(this);
        return removed;
      },
      removeAll: function(items) {
        var item, j, len, newBack, ref, removed;
        removed = [];
        if (items != null) {
          newBack = [];
          ref = this.value;
          for (j = 0, len = ref.length; j < len; j++) {
            item = ref[j];
            if (indexOf.call(items, item) >= 0) {
              removed.push(item);
            } else {
              newBack.push(item);
            }
          }
          this.value = newBack;
        } else {
          removed = this.value;
          this.value = [];
        }
        qdInternal.observables.updateDependencies.call(this);
        return removed;
      }
    },
    extendFunctions: function(obs) {
      obs.isObservable = true;
      obs.isBound = this.hasDependencies;
      obs.immediate = this.helpers.immediate;
      obs.silent = this.helpers.silent;
      obs.addComputedDependency = this.addComputedDependency;
      obs.not = (function(_this) {
        return function() {
          return _this.helpers.not.apply(obs, arguments);
        };
      })(this);
      obs.not.isObservable = true;
      qdInternal.eventing.add(obs);
      return obs;
    }
  };

  qd.observable = function(initialValue) {
    var obv;
    obv = function(newValue, immediate, alertDependencies) {
      if (immediate == null) {
        immediate = false;
      }
      if (alertDependencies == null) {
        alertDependencies = true;
      }
      if (qdInternal.state.current.model != null) {
        qdInternal.observables.addDependency.call(obv);
      }
      if (typeof newValue !== "undefined") {
        obv.value = newValue;
        if (alertDependencies) {
          qdInternal.observables.updateDependencies.call(obv, immediate);
        }
      } else {
        if (alertDependencies) {
          obv.emit('access', [], false);
          obv.emit('accessed');
        }
      }
      return obv.value;
    };
    obv.value = initialValue;
    return qdInternal.observables.extendFunctions(obv);
  };

  qd.computed = function(computedValue, thisBinding, observables) {
    var compute, j, len, observe;
    if (thisBinding == null) {
      qdInternal.errors["throw"](new QuickdrawError("Creating computed without specifying the appropriate this context to evaluate in"));
    }
    if ((observables == null) || observables.length === 0) {
      qdInternal.errors["throw"](new QuickdrawError("Creating computed without specifying the appropriate observables the computed uses"));
    }
    compute = function() {
      var params;
      params = 1 <= arguments.length ? slice.call(arguments, 0) : [];
      if (qdInternal.state.current.model != null) {
        qdInternal.observables.addDependency.call(compute);
      }
      return computedValue.apply(thisBinding, params);
    };
    for (j = 0, len = observables.length; j < len; j++) {
      observe = observables[j];
      if (observe == null) {
        qdInternal.errors["throw"](new QuickdrawError("Creating computed with undefined or null observables is not allowed"));
        continue;
      }
      qdInternal.observables.addComputedDependency.call(observe, compute);
    }
    return qdInternal.observables.extendFunctions(compute);
  };

  qd.observableArray = function(initialValue) {
    var arr, helpers;
    if (initialValue == null) {
      initialValue = [];
    }
    arr = qd.observable(initialValue);
    helpers = qdInternal.observables.helpers;
    arr.indexOf = helpers.indexOf;
    arr.slice = helpers.slice;
    arr.push = helpers.push;
    arr.pop = helpers.pop;
    arr.unshift = helpers.unshift;
    arr.shift = helpers.shift;
    arr.reverse = helpers.reverse;
    arr.sort = helpers.sort;
    arr.splice = helpers.splice;
    arr.remove = helpers.remove;
    arr.removeAll = helpers.removeAll;
    return arr;
  };

  qd.isObservable = function(value) {
    return !!(value != null ? value.isObservable : void 0);
  };

  qd.unwrapObservable = function(possible, recursive) {
    var index, j, key, len, recursed, ref, unwrapped, value;
    if (recursive == null) {
      recursive = false;
    }
    if (possible == null) {
      return possible;
    }
    unwrapped = possible;
    if (qd.isObservable(possible)) {
      unwrapped = (ref = typeof possible.silent === "function" ? possible.silent() : void 0) != null ? ref : possible();
    }
    if (unwrapped == null) {
      return unwrapped;
    }
    if (recursive && typeof unwrapped === 'object') {
      if (Object.prototype.toString.call(unwrapped) === '[object Array]') {
        recursed = new Array(unwrapped.length);
        for (index = j = 0, len = unwrapped.length; j < len; index = ++j) {
          value = unwrapped[index];
          recursed[index] = qd.unwrapObservable(value, true);
        }
      } else {
        recursed = {};
        for (key in unwrapped) {
          value = unwrapped[key];
          recursed[key] = qd.unwrapObservable(value, true);
        }
      }
      unwrapped = recursed;
    }
    return unwrapped;
  };

  qdInternal.renderer = {
    enqueue: function(virtualNode) {
      var renderState;
      if ((virtualNode == null) || !(virtualNode instanceof qdInternal.dom.VirtualDomNode)) {
        return qdInternal.errors["throw"](new QuickdrawError("Cannot queue a non-virtual node for render"));
      }
      renderState = qdInternal.state.render;
      if (!renderState.enqueuedNodes[virtualNode.getUniqueId()]) {
        renderState.enqueuedNodes[virtualNode.getUniqueId()] = true;
        qdInternal.state.render.queue.push(virtualNode);
      }
    },
    schedule: function() {
      if (qd.getConfig('renderAsync')) {
        if (qdInternal.state.render.key == null) {
          if (window.requestAnimationFrame != null) {
            qdInternal.state.render.key = -1;
            window.requestAnimationFrame(qdInternal.renderer.render);
          } else {
            qdInternal.state.render.key = qdInternal.async.immediate(qdInternal.renderer.render);
          }
          return qd.emit('renderScheduled', [
            {
              usingAnimationFrame: window.requestAnimationFrame != null
            }
          ], false);
        }
      } else {
        return qdInternal.renderer.render();
      }
    },
    render: function() {
      var j, k, l, len, len1, len2, node, patch, patchesToRender, ref, ref1;
      qdInternal.async.cancel(qdInternal.state.render.key);
      if (qd.getConfig('renderEnabled')) {
        qd.emit('renderWillOccur', null, false);
        patchesToRender = [];
        ref = qdInternal.state.render.queue;
        for (j = 0, len = ref.length; j < len; j++) {
          node = ref[j];
          patch = node.generatePatch();
          if (patch != null) {
            patchesToRender.push(patch);
          }
        }
        for (k = 0, len1 = patchesToRender.length; k < len1; k++) {
          patch = patchesToRender[k];
          qdInternal.renderer.renderPatch(patch);
        }
        ref1 = qdInternal.state.render.queue;
        for (l = 0, len2 = ref1.length; l < len2; l++) {
          node = ref1[l];
          node.emit('render', null, false);
        }
        qdInternal.state.render.queue = [];
        qdInternal.state.render.enqueuedNodes = {};
        qd.emit('renderHasOccurred', null, false);
      }
      qdInternal.state.render.key = null;
    },
    renderPatch: function(patch) {
      var action, beforeReference, garbage, j, key, len, node, parent, ref, ref1, ref2, ref3, ref4, value;
      node = patch.node;
      if (patch.properties != null) {
        ref = patch.properties;
        for (key in ref) {
          value = ref[key];
          node[key] = value;
        }
      }
      if (patch.attributes != null) {
        ref1 = patch.attributes;
        for (key in ref1) {
          value = ref1[key];
          if (value === null) {
            node.removeAttribute(key);
          } else {
            node.setAttribute(key, value);
          }
        }
      }
      if (patch.styles != null) {
        ref2 = patch.styles;
        for (key in ref2) {
          value = ref2[key];
          node.style[key] = value;
        }
      }
      if (patch.children == null) {
        return;
      }
      ref3 = patch.children;
      for (j = 0, len = ref3.length; j < len; j++) {
        action = ref3[j];
        if (action.type === "remove") {
          parent = action.value.parentNode;
          if (node === parent) {
            garbage = parent.removeChild(action.value);
          }
        } else {
          beforeReference = null;
          if ((action.follows != null) || (action.leads != null)) {
            beforeReference = (ref4 = action.leads) != null ? ref4 : action.follows.nextSibling;
          } else if (action.hasOwnProperty('follows')) {
            beforeReference = node.firstChild;
          }
          garbage = node.insertBefore(action.value, beforeReference);
        }
      }
    }
  };

  qd.disableRendering = function() {
    qd.setConfig('renderEnabled', false);
  };

  qd.enableRendering = function() {
    qd.setConfig('renderEnabled', true);
    qdInternal.renderer.render();
  };

  qdInternal.storage = {
    setInternalValue: function(node, name, value) {
      this.setValue(qdInternal.dom.unwrap(node), name, value, '_');
    },
    getInternalValue: function(node, name) {
      return this.getValue(qdInternal.dom.unwrap(node), name, '_');
    },
    setValue: function(node, name, value, namespace) {
      var base, storageKey;
      if (namespace == null) {
        namespace = qdInternal.state.current.handler;
      }
      storageKey = qd.getConfig('nodeDataKey');
      if (node[storageKey] == null) {
        node[storageKey] = {};
      }
      if ((base = node[storageKey])[namespace] == null) {
        base[namespace] = {};
      }
      node[storageKey][namespace][name] = value;
    },
    getValue: function(node, name, namespace) {
      var ref, ref1, ref2;
      if (namespace == null) {
        namespace = qdInternal.state.current.handler;
      }
      return (ref = (ref1 = node[qd.getConfig('nodeDataKey')]) != null ? (ref2 = ref1[namespace]) != null ? ref2[name] : void 0 : void 0) != null ? ref : null;
    },
    clearValues: function(node) {
      var storageKey;
      storageKey = qd.getConfig('nodeDataKey');
      if (node[storageKey] == null) {
        return;
      }
      delete node[storageKey];
    }
  };

  qdInternal.strings = {
    appendWithDelimiter: function(string, item, delimiter) {
      var result;
      result = string;
      if (result.length > 0 && result[result.length - 1] !== delimiter) {
        result += delimiter;
      }
      result += item;
      return result;
    },
    tokenizer: (function() {
      function _Class(string1, delimiter1) {
        this.string = string1;
        this.delimiter = delimiter1;
        this.pos = 0;
      }

      _Class.prototype.nextToken = function() {
        var nextpos, token;
        if (this.string == null) {
          return null;
        }
        while (this.string[this.pos] === this.delimiter && this.pos < this.string.length) {
          ++this.pos;
        }
        nextpos = this.pos;
        while (nextpos < this.string.length && this.string[nextpos] !== this.delimiter) {
          ++nextpos;
        }
        if (nextpos > this.pos) {
          token = this.string.substring(this.pos, nextpos);
          this.pos = nextpos;
          return token;
        }
        return null;
      };

      _Class.prototype.map = function(callback) {
        var nextToken;
        while ((nextToken = this.nextToken()) !== null) {
          callback(nextToken);
        }
      };

      _Class.prototype.toArray = function() {
        var values;
        values = [];
        this.map(function(token) {
          return values.push(token);
        });
        return values;
      };

      return _Class;

    })()
  };

  qdInternal.templates = {
    _uniqueId: 0,
    _generator: function(name, doc) {
      var index, j, len, newNodes, node, nodes;
      nodes = qdInternal.state.templates.nodes[name];
      newNodes = new Array(nodes.length);
      for (index = j = 0, len = nodes.length; j < len; index = ++j) {
        node = nodes[index];
        if (doc != null) {
          newNodes[index] = doc.importNode(node, true);
        } else {
          newNodes[index] = node.cloneNode(true);
        }
      }
      return newNodes;
    },
    resolve: function(name) {
      var ref;
      return (ref = qdInternal.state.templates.aliases[name]) != null ? ref : name;
    },
    exists: function(name) {
      var realName, ref;
      realName = (ref = qdInternal.state.templates.aliases[name]) != null ? ref : name;
      return qdInternal.state.templates.nodes[realName] != null;
    },
    get: function(name, doc) {
      var i, j, node, nodes, realName, ref, ref1, templateState;
      templateState = qdInternal.state.templates;
      realName = (ref = templateState.aliases[name]) != null ? ref : name;
      if (templateState.nodes[realName] == null) {
        return qdInternal.errors["throw"](new QuickdrawError("No template defined for given name"));
      }
      if (templateState.cache == null) {
        templateState.cache = qdInternal.cache.create(qdInternal.templates._generator);
      }
      nodes = templateState.cache.get(realName, doc);
      for (i = j = 0, ref1 = nodes.length; 0 <= ref1 ? j < ref1 : j > ref1; i = 0 <= ref1 ? ++j : --j) {
        node = nodes[i];
        if ((doc != null) && node.ownerDocument !== doc) {
          node = doc.adoptNode(node);
        }
        nodes[i] = qdInternal.dom.virtualize(node);
        nodes[i].setTemplateName(realName);
      }
      return nodes;
    },
    "return": function(name, nodes) {
      var i, j, len, node, realName, ref, storageNodes, templateState;
      templateState = qdInternal.state.templates;
      realName = (ref = templateState.aliases[name]) != null ? ref : name;
      if (templateState.nodes[realName] == null) {
        return qdInternal.errors["throw"](new QuickdrawError("Given name is not a valid template name"));
      }
      storageNodes = new Array(nodes.length);
      for (i = j = 0, len = nodes.length; j < len; i = ++j) {
        node = nodes[i];
        storageNodes[i] = qdInternal.dom.unwrap(node);
      }
      templateState.cache.put(realName, storageNodes);
    },
    register: function(nodes, name) {
      var cleanNodes, html, i, j, len, node, templateName, templateState;
      templateState = qdInternal.state.templates;
      if (templateState.aliases[name] != null) {
        return qdInternal.errors["throw"](new QuickdrawError("Template already defined for given name `" + name + "`"));
      }
      if ((nodes[0] != null) && (nodes[0] instanceof qdInternal.dom.VirtualDomNode)) {
        templateName = nodes[0].getTemplateName();
      }
      if (templateName == null) {
        html = "";
        cleanNodes = new Array(nodes.length);
        for (i = j = 0, len = nodes.length; j < len; i = ++j) {
          node = nodes[i];
          node = qdInternal.dom.unwrap(node);
          cleanNodes[i] = node;
          qdInternal.storage.clearValues(node);
          html += node.outerHTML;
        }
        if (templateState.html[html] == null) {
          templateName = qdInternal.templates._uniqueId++;
          templateState.html[html] = templateName;
          templateState.nodes[templateName] = cleanNodes;
        } else {
          templateName = templateState.html[html];
        }
      }
      if (name != null) {
        templateState.aliases[name] = templateName;
      }
      return name != null ? name : templateName;
    },
    unregister: function(name) {
      delete qdInternal.state.templates.aliases[name];
    },
    clearCache: function() {
      var ref;
      if ((ref = qdInternal.state.templates.cache) != null) {
        ref.clear();
      }
    }
  };

  qd.registerTemplate = function(name, templateNodes) {
    if (!(templateNodes instanceof Array)) {
      return qdInternal.errors["throw"](new QuickdrawError("Nodes for template must be given as an array"));
    }
    return qdInternal.templates.register(templateNodes, name);
  };

  qdInternal.updates = {
    run: function() {
      qdInternal.async.cancel(qdInternal.state.updates.key);
      if (qd.getConfig('updatesEnabled')) {
        qdInternal.updates.updateNodeSet(qdInternal.state.updates.queue);
        qdInternal.state.updates.queue.length = 0;
      }
      qdInternal.state.updates.key = null;
      qdInternal.state.updates.immediate = false;
    },
    updateNodeSet: function(nodes) {
      var bindingContext, dependency, i;
      qd.emit("updatesWillOccur", null, false);
      i = 0;
      while (i < nodes.length) {
        dependency = qdInternal.dom.virtualize(nodes[i++]);
        bindingContext = qdInternal.context.get(dependency);
        if (bindingContext == null) {
          continue;
        }
        qdInternal.binding.updateDomNode(dependency, bindingContext);
      }
      qdInternal.templates.clearCache();
      qdInternal.renderer.schedule();
      qd.emit("updatesHaveOccurred", null, false);
    },
    schedule: function(immediately) {
      var updatesState;
      if (immediately == null) {
        immediately = false;
      }
      if (qd.getConfig('updatesAsync')) {
        updatesState = qdInternal.state.updates;
        if (updatesState.queue.length >= qd.getConfig('maxQueuedUpdates') || immediately) {
          if (!updatesState.immediate) {
            qdInternal.async.cancel(updatesState.key);
            updatesState.key = qdInternal.async.immediate(qdInternal.updates.run);
            updatesState.immediate = true;
          }
        } else if (updatesState.key == null) {
          updatesState.key = qdInternal.async.delayed(qdInternal.updates.run, qd.getConfig('defaultUpdateTimeout'));
        }
      } else {
        qdInternal.updates.run();
      }
    },
    enqueue: function(domNode) {
      if (indexOf.call(qdInternal.state.updates.queue, domNode) < 0) {
        qdInternal.state.updates.queue.push(domNode);
      }
    }
  };

  qd.disableUpdates = function() {
    qd.setConfig('updatesEnabled', false);
    qdInternal.async.cancel(qdInternal.state.updates.key);
    qdInternal.state.updates.key = null;
  };

  qd.enableUpdates = function(runEnqueuedSynchronously) {
    if (runEnqueuedSynchronously == null) {
      runEnqueuedSynchronously = false;
    }
    qd.setConfig('updatesEnabled', true);
    if (qdInternal.state.updates.queue.length > 0) {
      qdInternal.updates.schedule(true);
      if (runEnqueuedSynchronously) {
        qdInternal.updates.run();
      }
    }
  };

  qd.registerBindingHandler('attr', {
    update: function(bindingData, node) {
      var attrName, boundAttributes, newValue, oldValue, ref, ref1, value;
      boundAttributes = (ref = node.getValue('attributes')) != null ? ref : {};
      ref1 = qd.unwrapObservable(bindingData);
      for (attrName in ref1) {
        if (!hasProp.call(ref1, attrName)) continue;
        value = ref1[attrName];
        newValue = qd.unwrapObservable(value);
        oldValue = node.getAttribute(attrName);
        boundAttributes[attrName] = true;
        if ((newValue != null) && oldValue !== newValue) {
          node.setAttribute(attrName, newValue);
        } else if (newValue == null) {
          node.removeAttribute(attrName);
        }
      }
      node.setValue('attributes', boundAttributes);
      return true;
    },
    cleanup: function(node) {
      var attrName, ref, value;
      ref = node.getValue('attributes');
      for (attrName in ref) {
        value = ref[attrName];
        node.removeAttribute(attrName);
      }
    }
  });

  qd.registerBindingHandler('complete', {
    initialize: function(bindingData, node, bindingContext) {
      var error;
      if (typeof bindingData !== 'function') {
        error = new this.errors.QuickdrawError("Binding data for complete handler must be a callback function");
        error.setBindingContext(bindingContext);
        return this.errors["throw"](error);
      }
      return this.async.immediate(function() {
        return bindingData();
      });
    }
  });

  CSS_CLASS_DELIM = " ";

  qd.registerBindingHandler('css', {
    initialize: function(bindingData, node) {
      var ref, tokenizer;
      tokenizer = new this.strings.tokenizer((ref = node.getProperty('className')) != null ? ref : "", CSS_CLASS_DELIM);
      return node.setValue('original', tokenizer.toArray());
    },
    update: function(bindingData, node) {
      var aClass, className, classString, j, keep, len, original, toKeep, tokenizer, truth, value;
      toKeep = {};
      original = node.getValue('original');
      tokenizer = new this.strings.tokenizer(node.getProperty('className'), CSS_CLASS_DELIM);
      bindingData = qd.unwrapObservable(bindingData);
      for (j = 0, len = original.length; j < len; j++) {
        value = original[j];
        toKeep[value] = true;
      }
      if (typeof bindingData === 'object') {
        tokenizer.map(function(token) {
          if (bindingData[token] != null) {
            return toKeep[token] = true;
          }
        });
        for (className in bindingData) {
          if (!hasProp.call(bindingData, className)) continue;
          truth = bindingData[className];
          truth = qd.unwrapObservable(truth);
          if (className === '_$') {
            toKeep[truth] = true;
          } else {
            toKeep[className] = truth;
          }
        }
      } else if (bindingData != null) {
        toKeep[bindingData] = true;
      }
      classString = "";
      for (aClass in toKeep) {
        keep = toKeep[aClass];
        if (keep) {
          classString = this.strings.appendWithDelimiter(classString, aClass, CSS_CLASS_DELIM);
        }
      }
      node.setProperty('className', classString);
      return true;
    },
    cleanup: function(node) {
      var original, ref;
      original = (ref = node.getValue('original')) != null ? ref : [];
      return node.setProperty('className', original.join(CSS_CLASS_DELIM));
    }
  });

  qd.registerBindingHandler('disable', {
    update: function(bindingData, node) {
      var shouldDisable;
      shouldDisable = qd.unwrapObservable(bindingData);
      node.setProperty('disabled', shouldDisable ? true : false);
      return true;
    }
  });

  qd.registerBindingHandler('enable', {
    update: function(bindingData, node) {
      var shouldEnable;
      shouldEnable = qd.unwrapObservable(bindingData);
      node.setProperty('disabled', !shouldEnable ? true : false);
      return true;
    }
  });

  HANDLER_NAME = 'event';

  dispatchEvent = function(event) {
    var callback, context, currentTarget, eventName;
    currentTarget = event.target;
    eventName = event.type;
    callback = null;
    while ((currentTarget != null) && (callback == null)) {
      callback = this.storage.getValue(currentTarget, eventName, HANDLER_NAME);
      if (callback == null) {
        currentTarget = currentTarget.parentElement;
      }
    }
    if (callback != null) {
      event.stopPropagation();
      context = this.context.get(currentTarget);
      if (callback(context, event) !== true) {
        event.preventDefault();
      }
    }
    return true;
  };


  /**
   * Registers an event listener on the document which will intercept events during
   * the capture phase
   */

  registerGlobalHandler = function(node, eventName, callback) {
    var document, globalRegistry, ref;
    document = node.getProperty('ownerDocument');
    globalRegistry = (ref = this.storage.getValue(document, 'registry')) != null ? ref : {};
    if (globalRegistry[eventName] == null) {
      globalRegistry[eventName] = (function(_this) {
        return function(event) {
          return dispatchEvent.call(_this, event);
        };
      })(this);
      document.addEventListener(eventName, globalRegistry[eventName], true);
      this.storage.setValue(document, 'registry', globalRegistry);
    }
    node.setValue(eventName, callback);
  };


  /**
   * Registers an event listener on the bound DOM node which will respond to events
   * during the bubble phase
   */

  registerLocalHandler = function(node, eventName, callback) {
    var eventRegistry, ref;
    eventRegistry = (ref = this.storage.getValue(node, 'registry')) != null ? ref : {};
    if (eventRegistry[eventName] == null) {
      eventRegistry[eventName] = (function(_this) {
        return function(event) {
          return dispatchEvent.call(_this, event);
        };
      })(this);
      node.addEventListener(eventName, eventRegistry[eventName]);
      node.setValue(eventName, callback);
      this.storage.setValue(node, 'registry', eventRegistry);
    }
  };

  initialize = function(bindingData, node) {
    var binding, eventName, handler;
    for (eventName in bindingData) {
      if (!hasProp.call(bindingData, eventName)) continue;
      binding = bindingData[eventName];
      if (binding == null) {
        continue;
      }
      if (typeof binding === 'function') {
        handler = binding;
        registerGlobalHandler.call(this, node, eventName, handler);
      } else {
        handler = binding.handler;
        registerLocalHandler.call(this, node, eventName, handler);
      }
    }
    if (this.state.current.model != null) {
      this.context.set(node, this.state.current.model);
    }
  };

  cleanup = function(node) {
    var binding, eventName, ref, registry;
    registry = (ref = this.storage.getValue(node, 'registry')) != null ? ref : {};
    for (eventName in registry) {
      binding = registry[eventName];
      node.setValue(eventName, null);
      node.removeEventListener(eventName, binding);
      delete registry[eventName];
    }
    return this.storage.setValue(node, 'registry', registry);
  };

  qd.registerBindingHandler(HANDLER_NAME, {
    initialize: initialize,
    cleanup: cleanup
  });

  qd.registerBindingHandler('foreach', {
    initialize: function(bindingData, node) {
      var children, ref, templateName;
      children = node.getChildren();
      templateName = (ref = children[0]) != null ? ref.getTemplateName() : void 0;
      if (templateName != null) {
        this.templates["return"](templateName, children);
      } else {
        templateName = this.templates.register(children);
      }
      node.setValue('childTemplate', templateName);
      node.clearChildren();
    },
    update: function(bindingData, node, bindingContext) {
      var child, childContext, context, curPos, currentChildren, declaredTemplate, doc, groupStartIndex, i, index, indexChanged, j, k, l, leftover, len, len1, len2, model, modelTemplate, newChildren, newIndex, nextModel, nodeGroup, nodes, nodesReused, pieces, rawBindingData, ref, ref1, ref2, ref3, ref4, ref5, templateName, useTemplatesFromModels;
      doc = node.getProperty('ownerDocument') || document;
      templateName = node.getValue('childTemplate');
      rawBindingData = qd.unwrapObservable(bindingData);
      if (!(rawBindingData instanceof Array)) {
        useTemplatesFromModels = rawBindingData.templatesFromModels;
        rawBindingData = qd.unwrapObservable(rawBindingData.data);
      }
      if (useTemplatesFromModels == null) {
        useTemplatesFromModels = false;
      }
      pieces = {};
      currentChildren = node.getChildren();
      groupStartIndex = 0;
      while (groupStartIndex < currentChildren.length) {
        child = currentChildren[groupStartIndex];
        index = child.getValue('index');
        if (index != null) {
          nodeGroup = [];
          curPos = groupStartIndex;
          while (curPos < currentChildren.length && currentChildren[curPos].getValue('index') === index) {
            nodeGroup.push(currentChildren[curPos++]);
          }
          model = child.getValue('model');
          modelTemplate = nodeGroup[0].getTemplateName();
          newIndex = rawBindingData.indexOf(model);
          if (newIndex !== -1) {
            pieces[newIndex] = {
              model: model,
              indexChanged: newIndex !== index
            };
            declaredTemplate = qd.unwrapObservable(rawBindingData[newIndex].template);
            declaredTemplate = this.templates.resolve(declaredTemplate);
            if (!useTemplatesFromModels || modelTemplate === declaredTemplate) {
              pieces[newIndex].nodes = nodeGroup;
            }
          }
          if (((ref = pieces[newIndex]) != null ? ref.nodes : void 0) == null) {
            for (j = 0, len = nodeGroup.length; j < len; j++) {
              leftover = nodeGroup[j];
              qd.unbindModel(leftover);
            }
            this.templates["return"](modelTemplate, nodeGroup);
          }
          if (newIndex === -1 && qd.isObservable(model.template)) {
            this.observables.removeDependency.call(model.template, node);
          }
          groupStartIndex += nodeGroup.length;
        } else {
          groupStartIndex++;
        }
      }
      newChildren = [];
      for (i = k = 0, len1 = rawBindingData.length; k < len1; i = ++k) {
        model = rawBindingData[i];
        modelTemplate = templateName;
        if (useTemplatesFromModels) {
          if (model.template == null) {
            this.errors["throw"](new QuickdrawError("Foreach told to use template from model but model does not specify one"));
          }
          modelTemplate = qd.unwrapObservable(model.template);
          if (qd.isObservable(model.template)) {
            this.observables.addDependency.call(model.template, this.models.get(node), node, 'foreach');
          }
        }
        nodes = (ref1 = (ref2 = pieces[i]) != null ? ref2.nodes : void 0) != null ? ref1 : this.templates.get(modelTemplate, doc);
        indexChanged = (ref3 = (ref4 = pieces[i]) != null ? ref4.indexChanged : void 0) != null ? ref3 : true;
        nodesReused = ((ref5 = pieces[i]) != null ? ref5.nodes : void 0) != null;
        for (l = 0, len2 = nodes.length; l < len2; l++) {
          child = nodes[l];
          child.setValue('index', i);
          child.setValue('model', model);
          newChildren.push(child);
          if (child.getProperty('nodeType') === 1) {
            if (nodesReused && indexChanged) {
              context = child.getValue('context');
              context.$index(i);
            } else if (!nodesReused) {
              nextModel = this.models.create(model);
              childContext = bindingContext.$extend(nextModel);
              childContext.$index = qd.observable(i);
              this.binding.bindModel(nextModel, child, childContext);
              child.setValue('context', childContext);
            }
          }
        }
      }
      node.setChildren(newChildren);
      rawBindingData = null;
      pieces = null;
      nodeGroup = null;
      child = null;
      node = null;
      leftover = null;
      return false;
    },
    cleanup: function(node) {
      var child, children, curPos, dispose, groupStartIndex, groupTemplate, index, j, len, nodeGroup, originalChildren, ref, templateName;
      templateName = node.getValue('childTemplate');
      children = node.getChildren();
      groupStartIndex = 0;
      while (groupStartIndex < children.length) {
        child = children[groupStartIndex];
        index = child.getValue('index');
        if (index != null) {
          nodeGroup = [];
          curPos = groupStartIndex;
          while (curPos < children.length && children[curPos].getValue('index') === index) {
            nodeGroup.push(children[curPos++]);
          }
          groupTemplate = (ref = child.getTemplateName()) != null ? ref : templateName;
          for (j = 0, len = nodeGroup.length; j < len; j++) {
            dispose = nodeGroup[j];
            qd.unbindModel(dispose);
          }
          this.templates["return"](groupTemplate, nodeGroup);
          groupStartIndex += nodeGroup.length;
        } else {
          groupStartIndex++;
        }
      }
      originalChildren = this.templates.get(templateName, node.getProperty('ownerDocument'));
      node.setChildren(originalChildren);
      children = null;
      child = null;
      nodeGroup = null;
    }
  }, ["template"]);

  qd.registerBindingHandler('html', {
    update: function(bindingData, node) {
      var dataToSet;
      dataToSet = qd.unwrapObservable(bindingData);
      node.setProperty('innerHTML', dataToSet);
      return true;
    }
  });

  qd.registerBindingHandler('if', {
    initialize: function(bindingData, node) {
      var children, ref, templateName;
      children = node.getChildren();
      templateName = (ref = children[0]) != null ? ref.getTemplateName() : void 0;
      if (templateName != null) {
        this.templates["return"](templateName, children);
      } else {
        templateName = this.templates.register(children);
      }
      node.setValue('template', templateName);
      node.setValue('hasNodes', false);
      this.context.set(node, this.state.current.model);
      return node.clearChildren();
    },
    update: function(bindingData, node, bindingContext) {
      var child, children, hasNodes, j, k, len, len1, ref, templateName, truthValue;
      truthValue = qd.unwrapObservable(bindingData);
      templateName = node.getValue('template');
      hasNodes = node.getValue('hasNodes');
      children = node.getChildren();
      if (truthValue && !hasNodes) {
        node.setChildren(this.templates.get(templateName, node.getProperty('ownerDocument')));
        ref = node.getChildren();
        for (j = 0, len = ref.length; j < len; j++) {
          child = ref[j];
          if (child.getProperty('nodeType') === 1) {
            this.binding.bindModel(this.models.get(node), child, bindingContext);
          }
        }
        node.setValue('hasNodes', true);
      } else if (!truthValue && hasNodes) {
        for (k = 0, len1 = children.length; k < len1; k++) {
          child = children[k];
          qd.unbindModel(child);
        }
        this.templates["return"](templateName, children);
        node.clearChildren();
        node.setValue('hasNodes', false);
      }
      return false;
    },
    cleanup: function(node) {
      var hasNodes, templateName;
      hasNodes = node.getValue('hasNodes');
      templateName = node.getValue('template');
      if (!hasNodes) {
        node.setChildren(this.templates.get(templateName, node.getProperty('ownerDocument')));
      }
    }
  }, ["template"]);

  qd.registerBindingHandler('style', {
    update: function(bindingData, node) {
      var changes, newValue, oldValue, styleName, value;
      changes = node.getValue('changes');
      for (styleName in bindingData) {
        if (!hasProp.call(bindingData, styleName)) continue;
        value = bindingData[styleName];
        newValue = qd.unwrapObservable(value);
        oldValue = node.getStyle(styleName);
        if (oldValue !== newValue) {
          if (changes == null) {
            changes = {};
          }
          if (changes[styleName] == null) {
            changes[styleName] = oldValue;
          }
          node.setStyle(styleName, newValue);
        }
      }
      if (changes != null) {
        node.setValue('changes', changes);
      }
      return true;
    },
    cleanup: function(node) {
      var changes, key, value;
      changes = node.getValue('changes');
      if (changes != null) {
        for (key in changes) {
          value = changes[key];
          node.setStyle(key, value);
        }
      }
    }
  });

  qd.registerBindingHandler('template', {
    initialize: function(templateName, containerNode, bindingContext) {
      var error, templateNodes;
      templateName = qd.unwrapObservable(templateName);
      if (templateName == null) {
        return true;
      }
      if (!this.templates.exists(templateName)) {
        error = new this.errors.QuickdrawError("Given template `" + templateName + "` has not been registered with Quickdraw");
        error.setBindingContext(bindingContext);
        return this.errors["throw"](error);
      }
      containerNode.setValue('template', templateName);
      templateNodes = this.templates.get(templateName, containerNode.getProperty('ownerDocument'));
      containerNode.setChildren(templateNodes);
      return true;
    },
    cleanup: function(node) {
      var child, children, j, len, templateName;
      children = node.getChildren();
      for (j = 0, len = children.length; j < len; j++) {
        child = children[j];
        this.binding.unbindDomTree(child);
      }
      templateName = node.getValue('template');
      this.templates["return"](templateName, children);
      node.clearChildren();
    }
  });

  qd.registerBindingHandler('text', {
    update: function(bindingData, node) {
      var dataToSet;
      dataToSet = qd.unwrapObservable(bindingData);
      node.setProperty('textContent', dataToSet);
      return true;
    }
  });

  qd.registerBindingHandler('uniqueName', {
    initialize: function(bindingData, node) {
      var nodeId;
      nodeId = this.dom.uniqueId(node);
      return node.setAttribute('name', 'qd_' + nodeId);
    }
  });

  qd.registerBindingHandler('visible', {
    update: function(bindingData, node) {
      node.setStyle('display', qd.unwrapObservable(bindingData) ? "" : "none");
      return true;
    }
  });

  qd.registerBindingHandler('with', {
    initialize: function(bindingData, node) {
      var children, ref, templateName;
      children = node.getChildren();
      templateName = (ref = children[0]) != null ? ref.getTemplateName() : void 0;
      if (templateName != null) {
        this.templates["return"](templateName, children);
      } else {
        templateName = this.templates.register(children);
      }
      node.setValue('originalTemplate', templateName);
      node.clearChildren();
    },
    update: function(bindingData, node, bindingContext) {
      var child, childBindingData, childContext, children, currentTemplate, dataHasChanged, dataToBind, j, k, len, len1, ref, templateHasChanged, templateName, useTemplateFromModel;
      dataToBind = qd.unwrapObservable(bindingData);
      templateName = node.getValue('originalTemplate');
      if ((dataToBind != null) && (dataToBind.templateFromModel != null)) {
        useTemplateFromModel = dataToBind.templateFromModel;
        if (!dataToBind.hasOwnProperty('model')) {
          this.errors["throw"](new QuickdrawError("When specifing options to 'with' you must specify a model to use for child binding"));
        }
        dataToBind = qd.unwrapObservable(dataToBind.model);
        if ((dataToBind != null) && useTemplateFromModel) {
          if (dataToBind.template == null) {
            this.errors["throw"](new QuickdrawError("You have requested 'with' to use templates from the model but have not specified one"));
          }
          templateName = qd.unwrapObservable(dataToBind.template);
        }
      }
      currentTemplate = node.getValue('template');
      templateHasChanged = templateName !== currentTemplate;
      dataHasChanged = dataToBind !== node.getValue('model');
      if ((currentTemplate != null) && (dataHasChanged || templateHasChanged)) {
        children = node.getChildren();
        for (j = 0, len = children.length; j < len; j++) {
          child = children[j];
          qd.unbindModel(child);
        }
        node.setValue('model', null);
        if ((dataToBind == null) || templateHasChanged) {
          this.templates["return"](currentTemplate, children);
          node.setValue('template', null);
          node.clearChildren();
        }
      }
      if (dataToBind == null) {
        return false;
      }
      if (templateHasChanged) {
        node.setChildren(this.templates.get(templateName, node.getProperty('ownerDocument')));
        node.setValue('template', templateName);
      }
      if (dataHasChanged || templateHasChanged) {
        childBindingData = this.models.create(dataToBind);
        childContext = bindingContext.$extend(childBindingData);
        ref = node.getChildren();
        for (k = 0, len1 = ref.length; k < len1; k++) {
          child = ref[k];
          if (child.getProperty('nodeType') === 1) {
            this.binding.bindModel(childBindingData, child, childContext);
          }
        }
        node.setValue('model', dataToBind);
      }
      return false;
    },
    cleanup: function(node) {
      var child, children, currentTemplate, j, len, templateName;
      currentTemplate = node.getValue('template');
      templateName = node.getValue('originalTemplate');
      if (currentTemplate != null) {
        children = node.getChildren();
        for (j = 0, len = children.length; j < len; j++) {
          child = children[j];
          qd.unbindModel(child);
        }
        this.templates["return"](currentTemplate, children);
      }
      node.setChildren(this.templates.get(templateName, node.getProperty('ownerDocument')));
    }
  }, ["template"]);

}).call(this);
