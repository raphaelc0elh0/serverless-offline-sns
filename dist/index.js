"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var shell = require("shelljs");
var sns_adapter_1 = require("./sns-adapter");
var express = require("express");
var cors = require("cors");
var bodyParser = require("body-parser");
var sns_server_1 = require("./sns-server");
var _ = require("lodash");
var AWS = require("aws-sdk");
var path_1 = require("path");
var helpers_1 = require("./helpers");
var child_process_1 = require("child_process");
var fp_1 = require("lodash/fp");
var sls_config_parser_1 = require("./sls-config-parser");
var ServerlessOfflineSns = /** @class */ (function () {
    function ServerlessOfflineSns(serverless, options) {
        var _this = this;
        this.app = express();
        this.app.use(cors());
        this.app.use(function (req, res, next) {
            // fix for https://github.com/s12v/sns/issues/45 not sending content-type
            req.headers["content-type"] = req.headers["content-type"] || "text/plain";
            next();
        });
        this.app.use(bodyParser.json({
            type: ["application/json", "text/plain"],
            limit: "10mb",
        }));
        this.options = options;
        this.serverless = serverless;
        this.commands = {
            "offline-sns": {
                usage: "Listens to offline SNS events and passes them to configured Lambda fns",
                lifecycleEvents: ["start", "cleanup"],
                commands: {
                    start: {
                        lifecycleEvents: ["init", "end"],
                    },
                    cleanup: {
                        lifecycleEvents: ["init"],
                    },
                },
            },
        };
        this.hooks = {
            "before:offline:start": function () { return _this.start(); },
            "before:offline:start:init": function () { return _this.start(); },
            "after:offline:start:end": function () { return _this.stop(); },
            "offline-sns:start:init": function () {
                _this.start();
                return _this.waitForSigint();
            },
            "offline-sns:cleanup:init": function () { return __awaiter(_this, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    this.init();
                    this.setupSnsAdapter();
                    return [2 /*return*/, this.unsubscribeAll()];
                });
            }); },
            "offline-sns:start:end": function () { return _this.stop(); },
        };
    }
    ServerlessOfflineSns.prototype.init = function () {
        process.env = _.extend({}, this.serverless.service.provider.environment, process.env);
        this.config =
            this.serverless.service.custom["serverless-offline-sns"] || {};
        this.localPort = this.config.port || this.config.localPort || 4002;
        this.remotePort = this.config.port || this.config.remotePort || 4002;
        this.accountId = this.config.accountId || "123456789012";
        var offlineConfig = this.serverless.service.custom["serverless-offline"] || {};
        this.servicesDirectory = this.config.servicesDirectory || "";
        this.location = process.cwd();
        var locationRelativeToCwd = this.options.location || this.config.location || offlineConfig.location;
        if (locationRelativeToCwd) {
            this.location = process.cwd() + "/" + locationRelativeToCwd;
        }
        else if (this.serverless.config.servicePath) {
            this.location = this.serverless.config.servicePath;
        }
        if (this.serverless.service.provider.region) {
            this.region = this.serverless.service.provider.region;
        }
        else {
            this.region = "us-east-1";
        }
        this.autoSubscribe = this.config.autoSubscribe === undefined ? true : this.config.autoSubscribe;
        // Congure SNS client to be able to find us.
        AWS.config.sns = {
            endpoint: "http://127.0.0.1:" + this.localPort,
            region: this.region,
        };
    };
    ServerlessOfflineSns.prototype.start = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        this.init();
                        return [4 /*yield*/, this.listen()];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, this.serve()];
                    case 2:
                        _a.sent();
                        return [4 /*yield*/, this.subscribeAll()];
                    case 3:
                        _a.sent();
                        return [2 /*return*/, this.snsAdapter];
                }
            });
        });
    };
    ServerlessOfflineSns.prototype.waitForSigint = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                return [2 /*return*/, new Promise(function (res) {
                        process.on("SIGINT", function () {
                            _this.log("Halting offline-sns server");
                            res(true);
                        });
                    })];
            });
        });
    };
    ServerlessOfflineSns.prototype.serve = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                this.snsServer = new sns_server_1.SNSServer(function (msg, ctx) { return _this.debug(msg, ctx); }, this.app, this.region, this.accountId);
                return [2 /*return*/];
            });
        });
    };
    ServerlessOfflineSns.prototype.getFunctionName = function (name) {
        var result;
        Object.entries(this.serverless.service.functions).forEach(function (_a) {
            var funcName = _a[0], funcValue = _a[1];
            var events = (0, fp_1.get)(["events"], funcValue);
            events &&
                events.forEach(function (event) {
                    var attribute = (0, fp_1.get)(["sqs", "arn"], event);
                    if (!(0, fp_1.has)("Fn::GetAtt", attribute))
                        return;
                    var _a = attribute["Fn::GetAtt"], resourceName = _a[0], value = _a[1];
                    if (value !== "Arn")
                        return;
                    if (name !== resourceName)
                        return;
                    result = funcName;
                });
        });
        return result;
    };
    ServerlessOfflineSns.prototype.getResourceSubscriptions = function (serverless) {
        var _this = this;
        var _a;
        var resources = (_a = serverless.service.resources) === null || _a === void 0 ? void 0 : _a.Resources;
        var subscriptions = [];
        if (!resources)
            return subscriptions;
        new Map(Object.entries(resources)).forEach(function (value, key) {
            var type = (0, fp_1.get)(["Type"], value);
            if (type !== "AWS::SNS::Subscription")
                return;
            var endPoint = (0, fp_1.get)(["Properties", "Endpoint"], value);
            if (!(0, fp_1.has)("Fn::GetAtt", endPoint))
                return;
            var _a = endPoint["Fn::GetAtt"], resourceName = _a[0], attribute = _a[1];
            type = (0, fp_1.get)(["Type"], resources[resourceName]);
            if (attribute !== "Arn")
                return;
            if (type !== "AWS::SQS::Queue")
                return;
            var filterPolicy = (0, fp_1.get)(["Properties", "FilterPolicy"], value);
            var protocol = (0, fp_1.get)(["Properties", "Protocol"], value);
            var rawMessageDelivery = (0, fp_1.get)(["Properties", "RawMessageDelivery"], value);
            var topicArn = (0, fp_1.get)(["Properties", "TopicArn", "Ref"], value);
            var topicName = (0, fp_1.get)(["Properties", "TopicName"], resources[topicArn]);
            var fnName = _this.getFunctionName(resourceName);
            subscriptions.push({
                fnName: fnName,
                options: {
                    topicName: topicName,
                    protocol: protocol,
                    rawMessageDelivery: rawMessageDelivery,
                    filterPolicy: filterPolicy,
                },
            });
        });
        return subscriptions;
    };
    ServerlessOfflineSns.prototype.subscribeAll = function () {
        return __awaiter(this, void 0, void 0, function () {
            var subscribePromises, _loop_1, this_1, _i, _a, directory, subscriptions;
            var _this = this;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        this.setupSnsAdapter();
                        return [4 /*yield*/, this.unsubscribeAll()];
                    case 1:
                        _b.sent();
                        this.debug("subscribing functions");
                        subscribePromises = [];
                        if (!this.autoSubscribe) return [3 /*break*/, 7];
                        if (!this.servicesDirectory) return [3 /*break*/, 6];
                        shell.cd(this.servicesDirectory);
                        _loop_1 = function (directory) {
                            var service, serverless, subscriptions;
                            return __generator(this, function (_c) {
                                switch (_c.label) {
                                    case 0:
                                        shell.cd(directory);
                                        service = directory.split("/")[0];
                                        return [4 /*yield*/, (0, sls_config_parser_1.loadServerlessConfig)(shell.pwd().toString(), this_1.debug)];
                                    case 1:
                                        serverless = _c.sent();
                                        this_1.debug("Processing subscriptions for ", service);
                                        this_1.debug("shell.pwd()", shell.pwd());
                                        this_1.debug("serverless functions", serverless.service.functions);
                                        subscriptions = this_1.getResourceSubscriptions(serverless);
                                        subscriptions.forEach(function (subscription) {
                                            return subscribePromises.push(_this.subscribeFromResource(subscription, _this.location));
                                        });
                                        Object.keys(serverless.service.functions).map(function (fnName) {
                                            var fn = serverless.service.functions[fnName];
                                            subscribePromises.push(Promise.all(fn.events
                                                .filter(function (event) { return event.sns != null; })
                                                .map(function (event) {
                                                return _this.subscribe(serverless, fnName, event.sns, shell.pwd());
                                            })));
                                        });
                                        shell.cd("../");
                                        return [2 /*return*/];
                                }
                            });
                        };
                        this_1 = this;
                        _i = 0, _a = shell.ls("-d", "*/");
                        _b.label = 2;
                    case 2:
                        if (!(_i < _a.length)) return [3 /*break*/, 5];
                        directory = _a[_i];
                        return [5 /*yield**/, _loop_1(directory)];
                    case 3:
                        _b.sent();
                        _b.label = 4;
                    case 4:
                        _i++;
                        return [3 /*break*/, 2];
                    case 5: return [3 /*break*/, 7];
                    case 6:
                        subscriptions = this.getResourceSubscriptions(this.serverless);
                        subscriptions.forEach(function (subscription) {
                            return subscribePromises.push(_this.subscribeFromResource(subscription, _this.location));
                        });
                        Object.keys(this.serverless.service.functions).map(function (fnName) {
                            var fn = _this.serverless.service.functions[fnName];
                            subscribePromises.push(Promise.all(fn.events
                                .filter(function (event) { return event.sns != null; })
                                .map(function (event) {
                                return _this.subscribe(_this.serverless, fnName, event.sns, _this.location);
                            })));
                        });
                        _b.label = 7;
                    case 7: return [4 /*yield*/, this.subscribeAllQueues(subscribePromises)];
                    case 8:
                        _b.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    ServerlessOfflineSns.prototype.subscribeAllQueues = function (subscribePromises) {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, Promise.all(subscribePromises)];
                    case 1:
                        _a.sent();
                        this.debug("subscribing queues");
                        return [4 /*yield*/, Promise.all((this.config.subscriptions || []).map(function (sub) {
                                return _this.subscribeQueue(sub.queue, sub.topic);
                            }))];
                    case 2:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    ServerlessOfflineSns.prototype.subscribeFromResource = function (subscription, location) {
        return __awaiter(this, void 0, void 0, function () {
            var data, fn;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        this.debug("subscribe: " + subscription.fnName);
                        this.log("Creating topic: \"".concat(subscription.options.topicName, "\" for fn \"").concat(subscription.fnName, "\""));
                        return [4 /*yield*/, this.snsAdapter.createTopic(subscription.options.topicName)];
                    case 1:
                        data = _a.sent();
                        this.debug("topic: " + JSON.stringify(data));
                        fn = this.serverless.service.functions[subscription.fnName];
                        return [4 /*yield*/, this.snsAdapter.subscribe(fn, this.createHandler(subscription.fnName, fn, location), data.TopicArn, subscription.options)];
                    case 2:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    ServerlessOfflineSns.prototype.unsubscribeAll = function () {
        return __awaiter(this, void 0, void 0, function () {
            var subs;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.snsAdapter.listSubscriptions()];
                    case 1:
                        subs = _a.sent();
                        this.debug("subs!: " + JSON.stringify(subs));
                        return [4 /*yield*/, Promise.all(subs.Subscriptions.filter(function (sub) { return sub.Endpoint.indexOf(":" + _this.remotePort) > -1; })
                                .filter(function (sub) { return sub.SubscriptionArn !== "PendingConfirmation"; })
                                .map(function (sub) { return _this.snsAdapter.unsubscribe(sub.SubscriptionArn); }))];
                    case 2:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    ServerlessOfflineSns.prototype.subscribe = function (serverless, fnName, snsConfig, lambdasLocation) {
        return __awaiter(this, void 0, void 0, function () {
            var fn, topicName, data;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        this.debug("subscribe: " + fnName);
                        fn = serverless.service.functions[fnName];
                        if (!fn.runtime) {
                            fn.runtime = serverless.service.provider.runtime;
                        }
                        topicName = "";
                        // https://serverless.com/framework/docs/providers/aws/events/sns#using-a-pre-existing-topic
                        if (typeof snsConfig === "string") {
                            if (snsConfig.indexOf("arn:aws:sns") === 0) {
                                topicName = (0, helpers_1.topicNameFromArn)(snsConfig);
                            }
                            else {
                                topicName = snsConfig;
                            }
                        }
                        else if (snsConfig.topicName && typeof snsConfig.topicName === "string") {
                            topicName = snsConfig.topicName;
                        }
                        else if (snsConfig.arn && typeof snsConfig.arn === "string") {
                            topicName = (0, helpers_1.topicNameFromArn)(snsConfig.arn);
                        }
                        if (!topicName) {
                            this.log("Unable to create topic for \"".concat(fnName, "\". Please ensure the sns configuration is correct."));
                            return [2 /*return*/, Promise.resolve("Unable to create topic for \"".concat(fnName, "\". Please ensure the sns configuration is correct."))];
                        }
                        this.log("Creating topic: \"".concat(topicName, "\" for fn \"").concat(fnName, "\""));
                        return [4 /*yield*/, this.snsAdapter.createTopic(topicName)];
                    case 1:
                        data = _a.sent();
                        this.debug("topic: " + JSON.stringify(data));
                        return [4 /*yield*/, this.snsAdapter.subscribe(fn, this.createHandler(fnName, fn, lambdasLocation), data.TopicArn, snsConfig)];
                    case 2:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    ServerlessOfflineSns.prototype.subscribeQueue = function (queueUrl, snsConfig) {
        return __awaiter(this, void 0, void 0, function () {
            var topicName, data;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        this.debug("subscribe: " + queueUrl);
                        topicName = "";
                        // https://serverless.com/framework/docs/providers/aws/events/sns#using-a-pre-existing-topic
                        if (typeof snsConfig === "string") {
                            if (snsConfig.indexOf("arn:aws:sns") === 0) {
                                topicName = (0, helpers_1.topicNameFromArn)(snsConfig);
                            }
                            else {
                                topicName = snsConfig;
                            }
                        }
                        else if (snsConfig.topicName && typeof snsConfig.topicName === "string") {
                            topicName = snsConfig.topicName;
                        }
                        else if (snsConfig.arn && typeof snsConfig.arn === "string") {
                            topicName = (0, helpers_1.topicNameFromArn)(snsConfig.arn);
                        }
                        if (!topicName) {
                            this.log("Unable to create topic for \"".concat(queueUrl, "\". Please ensure the sns configuration is correct."));
                            return [2 /*return*/, Promise.resolve("Unable to create topic for \"".concat(queueUrl, "\". Please ensure the sns configuration is correct."))];
                        }
                        this.log("Creating topic: \"".concat(topicName, "\" for queue \"").concat(queueUrl, "\""));
                        return [4 /*yield*/, this.snsAdapter.createTopic(topicName)];
                    case 1:
                        data = _a.sent();
                        this.debug("topic: " + JSON.stringify(data));
                        return [4 /*yield*/, this.snsAdapter.subscribeQueue(queueUrl, data.TopicArn, snsConfig)];
                    case 2:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    ServerlessOfflineSns.prototype.createHandler = function (fnName, fn, location) {
        var _this = this;
        if (!fn.runtime || fn.runtime.startsWith("nodejs")) {
            return this.createJavascriptHandler(fn, location);
        }
        else {
            return function () { return _this.createProxyHandler(fnName, fn, location); };
        }
    };
    ServerlessOfflineSns.prototype.createProxyHandler = function (funName, funOptions, location) {
        var options = this.options;
        return function (event, context) {
            var args = ["invoke", "local", "-f", funName];
            var stage = options.s || options.stage;
            if (stage) {
                args.push("-s", stage);
            }
            // Use path to binary if provided, otherwise assume globally-installed
            var binPath = options.b || options.binPath;
            var cmd = binPath || "sls";
            var process = (0, child_process_1.spawn)(cmd, args, {
                cwd: location,
                shell: true,
                stdio: ["pipe", "pipe", "pipe"],
            });
            process.stdin.write("".concat(JSON.stringify(event), "\n"));
            process.stdin.end();
            var results = [];
            var error = false;
            process.stdout.on("data", function (data) {
                if (data) {
                    var str = data.toString();
                    if (str) {
                        // should we check the debug flag & only log if debug is true?
                        console.log(str);
                        results.push(data.toString());
                    }
                }
            });
            process.stderr.on("data", function (data) {
                error = true;
                console.warn("error", data);
                context.fail(data);
            });
            process.on("close", function (code) {
                if (!error) {
                    // try to parse to json
                    // valid result should be a json array | object
                    // technically a string is valid json
                    // but everything comes back as a string
                    // so we can't reliably detect json primitives with this method
                    var response = null;
                    // we go end to start because the one we want should be last
                    // or next to last
                    for (var i = results.length - 1; i >= 0; i--) {
                        // now we need to find the min | max [] or {} within the string
                        // if both exist then we need the outer one.
                        // { "something": [] } is valid,
                        // [{"something": "valid"}] is also valid
                        // *NOTE* Doesn't currently support 2 separate valid json bundles
                        // within a single result.
                        // this can happen if you use a python logger
                        // and then do log.warn(json.dumps({'stuff': 'here'}))
                        var item = results[i];
                        var firstCurly = item.indexOf("{");
                        var firstSquare = item.indexOf("[");
                        var start = 0;
                        var end = item.length;
                        if (firstCurly === -1 && firstSquare === -1) {
                            // no json found
                            continue;
                        }
                        if (firstSquare === -1 || firstCurly < firstSquare) {
                            // found an object
                            start = firstCurly;
                            end = item.lastIndexOf("}") + 1;
                        }
                        else if (firstCurly === -1 || firstSquare < firstCurly) {
                            // found an array
                            start = firstSquare;
                            end = item.lastIndexOf("]") + 1;
                        }
                        try {
                            response = JSON.parse(item.substring(start, end));
                            break;
                        }
                        catch (err) {
                            // not json, check the next one
                            continue;
                        }
                    }
                    if (response !== null) {
                        context.succeed(response);
                    }
                    else {
                        context.succeed(results.join("\n"));
                    }
                }
            });
        };
    };
    ServerlessOfflineSns.prototype.createJavascriptHandler = function (fn, location) {
        var _this = this;
        return function () {
            // Options are passed from the command line in the options parameter
            // ### OLD: use the main serverless config since this behavior is already supported there
            if (!_this.options.skipCacheInvalidation ||
                Array.isArray(_this.options.skipCacheInvalidation)) {
                var _loop_2 = function (key) {
                    // don't invalidate cached modules from node_modules ...
                    if (key.match(/node_modules/)) {
                        return "continue";
                    }
                    // if an array is provided to the serverless config, check the entries there too
                    if (Array.isArray(_this.options.skipCacheInvalidation) &&
                        _this.options.skipCacheInvalidation.find(function (pattern) {
                            return new RegExp(pattern).test(key);
                        })) {
                        return "continue";
                    }
                    delete require.cache[key];
                };
                for (var key in require.cache) {
                    _loop_2(key);
                }
            }
            _this.debug(process.cwd());
            var handlerFnNameIndex = fn.handler.lastIndexOf(".");
            var handlerPath = fn.handler.substring(0, handlerFnNameIndex);
            var handlerFnName = fn.handler.substring(handlerFnNameIndex + 1);
            var fullHandlerPath = (0, path_1.resolve)(location, handlerPath);
            _this.debug("require(" + fullHandlerPath + ")[" + handlerFnName + "]");
            var handler = require(fullHandlerPath)[handlerFnName];
            return handler;
        };
    };
    ServerlessOfflineSns.prototype.log = function (msg, prefix) {
        if (prefix === void 0) { prefix = "INFO[serverless-offline-sns]: "; }
        this.serverless.cli.log.call(this.serverless.cli, prefix + msg);
    };
    ServerlessOfflineSns.prototype.debug = function (msg, context) {
        if (this.config.debug) {
            if (context) {
                this.log(msg, "DEBUG[serverless-offline-sns][".concat(context, "]: "));
            }
            else {
                this.log(msg, "DEBUG[serverless-offline-sns]: ");
            }
        }
    };
    ServerlessOfflineSns.prototype.listen = function () {
        return __awaiter(this, void 0, void 0, function () {
            var host;
            var _this = this;
            return __generator(this, function (_a) {
                this.debug("starting plugin");
                host = "127.0.0.1";
                if (this.config.host) {
                    this.debug("using specified host ".concat(this.config.host));
                    host = this.config.host;
                }
                else if (this.options.host) {
                    this.debug("using offline specified host ".concat(this.options.host));
                    host = this.options.host;
                }
                return [2 /*return*/, new Promise(function (res) {
                        _this.server = _this.app.listen(_this.localPort, host, function () {
                            _this.debug("listening on ".concat(host, ":").concat(_this.localPort));
                            res(true);
                        });
                        _this.server.setTimeout(0);
                    })];
            });
        });
    };
    ServerlessOfflineSns.prototype.stop = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                this.init();
                this.debug("stopping plugin");
                if (this.server) {
                    this.server.close();
                }
                return [2 /*return*/];
            });
        });
    };
    ServerlessOfflineSns.prototype.setupSnsAdapter = function () {
        var _this = this;
        this.snsAdapter = new sns_adapter_1.SNSAdapter(this.localPort, this.remotePort, this.serverless.service.provider.region, this.config["sns-endpoint"], function (msg, ctx) { return _this.debug(msg, ctx); }, this.app, this.serverless.service.service, this.serverless.service.provider.stage, this.accountId, this.config.host, this.config["sns-subscribe-endpoint"]);
    };
    return ServerlessOfflineSns;
}());
module.exports = ServerlessOfflineSns;
