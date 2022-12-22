"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SNSServer = void 0;
var aws_sdk_1 = require("aws-sdk");
var node_fetch_1 = require("node-fetch");
var url_1 = require("url");
var bodyParser = require("body-parser");
var _ = require("lodash");
var xml = require("xml");
var helpers_1 = require("./helpers");
var SNSServer = /** @class */ (function () {
    function SNSServer(debug, app, region, accountId) {
        this.pluginDebug = debug;
        this.topics = [];
        this.subscriptions = [];
        this.app = app;
        this.region = region;
        this.routes();
        this.accountId = accountId;
    }
    SNSServer.prototype.routes = function () {
        var _this = this;
        this.debug("configuring route");
        this.app.use(bodyParser.json({ limit: "10mb" })); // for parsing application/json
        this.app.use(bodyParser.urlencoded({ extended: true, limit: "10mb" })); // for parsing application/x-www-form-urlencoded
        this.app.use(function (req, res, next) {
            res.header("Access-Control-Allow-Origin", "*");
            res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
            next();
        });
        this.app.all("/", function (req, res) {
            _this.debug("hello request");
            _this.debug(JSON.stringify(req.body));
            _this.debug(JSON.stringify(_this.subscriptions));
            if (req.body.Action === "ListSubscriptions") {
                _this.debug("sending: " + xml(_this.listSubscriptions(), { indent: "\t" }));
                res.send(xml(_this.listSubscriptions()));
            }
            else if (req.body.Action === "ListTopics") {
                _this.debug("sending: " + xml(_this.listTopics(), { indent: "\t" }));
                res.send(xml(_this.listTopics()));
            }
            else if (req.body.Action === "CreateTopic") {
                res.send(xml(_this.createTopic(req.body.Name)));
            }
            else if (req.body.Action === "Subscribe") {
                res.send(xml(_this.subscribe(req.body.Endpoint, req.body.Protocol, req.body.TopicArn, req.body)));
            }
            else if (req.body.Action === "Publish") {
                var target = _this.extractTarget(req.body);
                if (req.body.MessageStructure === "json") {
                    var json = JSON.parse(req.body.Message);
                    if (typeof json.default !== "string") {
                        throw new Error("Messages must have default key");
                    }
                }
                res.send(xml(_this.publish(target, req.body.Subject, req.body.Message, req.body.MessageStructure, (0, helpers_1.parseMessageAttributes)(req.body), req.body.MessageGroupId)));
            }
            else if (req.body.Action === "Unsubscribe") {
                res.send(xml(_this.unsubscribe(req.body.SubscriptionArn)));
            }
            else {
                res.send(xml({
                    NotImplementedResponse: [(0, helpers_1.createAttr)(), (0, helpers_1.createMetadata)()],
                }));
            }
            _this.debug(JSON.stringify(_this.subscriptions));
        });
    };
    SNSServer.prototype.listTopics = function () {
        this.debug("Topics: " + JSON.stringify(this.topics));
        return {
            ListTopicsResponse: [
                (0, helpers_1.createAttr)(),
                (0, helpers_1.createMetadata)(),
                {
                    ListTopicsResult: [
                        {
                            Topics: this.topics.map(function (topic) {
                                return {
                                    member: (0, helpers_1.arrayify)({
                                        TopicArn: topic.TopicArn,
                                    }),
                                };
                            }),
                        },
                    ],
                },
            ],
        };
    };
    SNSServer.prototype.listSubscriptions = function () {
        this.debug(this.subscriptions.map(function (sub) {
            return {
                member: [sub],
            };
        }));
        return {
            ListSubscriptionsResponse: [
                (0, helpers_1.createAttr)(),
                (0, helpers_1.createMetadata)(),
                {
                    ListSubscriptionsResult: [
                        {
                            Subscriptions: this.subscriptions.map(function (sub) {
                                return {
                                    member: (0, helpers_1.arrayify)({
                                        Endpoint: sub.Endpoint,
                                        TopicArn: sub.TopicArn,
                                        Owner: sub.Owner,
                                        Protocol: sub.Protocol,
                                        SubscriptionArn: sub.SubscriptionArn,
                                    }),
                                };
                            }),
                        },
                    ],
                },
            ],
        };
    };
    SNSServer.prototype.unsubscribe = function (arn) {
        this.debug(JSON.stringify(this.subscriptions));
        this.debug("unsubscribing: " + arn);
        this.subscriptions = this.subscriptions.filter(function (sub) { return sub.SubscriptionArn !== arn; });
        return {
            UnsubscribeResponse: [(0, helpers_1.createAttr)(), (0, helpers_1.createMetadata)()],
        };
    };
    SNSServer.prototype.createTopic = function (topicName) {
        var topicArn = (0, helpers_1.topicArnFromName)(topicName, this.region, this.accountId);
        var topic = {
            TopicArn: topicArn,
        };
        if (!this.topics.find(function (_a) {
            var TopicArn = _a.TopicArn;
            return TopicArn === topicArn;
        })) {
            this.topics.push(topic);
        }
        return {
            CreateTopicResponse: [
                (0, helpers_1.createAttr)(),
                (0, helpers_1.createMetadata)(),
                {
                    CreateTopicResult: [
                        {
                            TopicArn: topicArn,
                        },
                    ],
                },
            ],
        };
    };
    SNSServer.prototype.subscribe = function (endpoint, protocol, arn, body) {
        var attributes = (0, helpers_1.parseAttributes)(body);
        var filterPolicies = attributes["FilterPolicy"] && JSON.parse(attributes["FilterPolicy"]);
        arn = this.convertPseudoParams(arn);
        var existingSubscription = this.subscriptions.find(function (subscription) {
            return (subscription.Endpoint === endpoint && subscription.TopicArn === arn);
        });
        var subscriptionArn;
        if (!existingSubscription) {
            var sub = {
                SubscriptionArn: arn + ":" + Math.floor(Math.random() * (1000000 - 1)),
                Protocol: protocol,
                TopicArn: arn,
                Endpoint: endpoint,
                Owner: "",
                Attributes: attributes,
                Policies: filterPolicies,
            };
            this.subscriptions.push(sub);
            subscriptionArn = sub.SubscriptionArn;
        }
        else {
            subscriptionArn = existingSubscription.SubscriptionArn;
        }
        return {
            SubscribeResponse: [
                (0, helpers_1.createAttr)(),
                (0, helpers_1.createMetadata)(),
                {
                    SubscribeResult: [
                        {
                            SubscriptionArn: subscriptionArn,
                        },
                    ],
                },
            ],
        };
    };
    SNSServer.prototype.evaluatePolicies = function (policies, messageAttrs) {
        var shouldSend = false;
        for (var _i = 0, _a = Object.entries(policies); _i < _a.length; _i++) {
            var _b = _a[_i], k = _b[0], v = _b[1];
            if (!messageAttrs[k]) {
                shouldSend = false;
                break;
            }
            var attrs = void 0;
            if (messageAttrs[k].Type.endsWith(".Array")) {
                attrs = JSON.parse(messageAttrs[k].Value);
            }
            else {
                attrs = [messageAttrs[k].Value];
            }
            if (_.intersection(v, attrs).length > 0) {
                this.debug("filterPolicy Passed: " +
                    v +
                    " matched message attrs: " +
                    JSON.stringify(attrs));
                shouldSend = true;
            }
            else {
                shouldSend = false;
                break;
            }
        }
        if (!shouldSend) {
            this.debug("filterPolicy Failed: " +
                JSON.stringify(policies) +
                " did not match message attrs: " +
                JSON.stringify(messageAttrs));
        }
        return shouldSend;
    };
    SNSServer.prototype.publishHttp = function (event, sub, raw) {
        var _this = this;
        return (0, node_fetch_1.default)(sub.Endpoint, {
            method: "POST",
            body: event,
            timeout: 0,
            headers: {
                "x-amz-sns-rawdelivery": "" + raw,
                "Content-Type": "text/plain; charset=UTF-8",
                "Content-Length": Buffer.byteLength(event),
            },
        })
            .then(function (res) { return _this.debug(res); })
            .catch(function (ex) { return _this.debug(ex); });
    };
    SNSServer.prototype.publishSqs = function (event, sub, messageAttributes, messageGroupId) {
        var _a;
        var subEndpointUrl = new url_1.URL(sub.Endpoint);
        var sqsEndpoint = "".concat(subEndpointUrl.protocol, "//").concat(subEndpointUrl.host, "/");
        var sqs = new aws_sdk_1.SQS({ endpoint: sqsEndpoint, region: this.region });
        if (sub["Attributes"]["RawMessageDelivery"] === "true") {
            return sqs
                .sendMessage(__assign({ QueueUrl: sub.Endpoint, MessageBody: event, MessageAttributes: (0, helpers_1.formatMessageAttributes)(messageAttributes) }, (messageGroupId && { MessageGroupId: messageGroupId })))
                .promise();
        }
        else {
            var records = (_a = JSON.parse(event).Records) !== null && _a !== void 0 ? _a : [];
            var messagePromises = records.map(function (record) {
                return sqs
                    .sendMessage(__assign({ QueueUrl: sub.Endpoint, MessageBody: JSON.stringify(record.Sns), MessageAttributes: (0, helpers_1.formatMessageAttributes)(messageAttributes) }, (messageGroupId && { MessageGroupId: messageGroupId })))
                    .promise();
            });
            return Promise.all(messagePromises);
        }
    };
    SNSServer.prototype.publish = function (topicArn, subject, message, messageStructure, messageAttributes, messageGroupId) {
        var _this = this;
        var messageId = (0, helpers_1.createMessageId)();
        Promise.all(this.subscriptions
            .filter(function (sub) { return sub.TopicArn === topicArn; })
            .map(function (sub) {
            var isRaw = sub["Attributes"]["RawMessageDelivery"] === "true";
            if (sub["Policies"] &&
                !_this.evaluatePolicies(sub["Policies"], messageAttributes)) {
                _this.debug("Filter policies failed. Skipping subscription: " + sub.Endpoint);
                return;
            }
            _this.debug("fetching: " + sub.Endpoint);
            var event;
            if (isRaw) {
                event = message;
            }
            else {
                event = JSON.stringify((0, helpers_1.createSnsTopicEvent)(topicArn, sub.SubscriptionArn, subject, message, messageId, messageStructure, messageAttributes, messageGroupId));
            }
            _this.debug("event: " + event);
            if (!sub.Protocol) {
                sub.Protocol = "http";
            }
            var protocol = sub.Protocol.toLowerCase();
            if (protocol === "http") {
                return _this.publishHttp(event, sub, isRaw);
            }
            if (protocol === "sqs") {
                return _this.publishSqs(JSON.stringify((0, helpers_1.createSnsLambdaEvent)(topicArn, sub.SubscriptionArn, subject, message, messageId, messageAttributes, messageGroupId)), sub, messageAttributes, messageGroupId);
            }
            throw new Error("Protocol '".concat(protocol, "' is not supported by serverless-offline-sns"));
        }));
        return {
            PublishResponse: [
                (0, helpers_1.createAttr)(),
                {
                    PublishResult: [
                        {
                            MessageId: messageId,
                        },
                    ],
                },
                (0, helpers_1.createMetadata)(),
            ],
        };
    };
    SNSServer.prototype.extractTarget = function (body) {
        if (!body.PhoneNumber) {
            var target = body.TopicArn || body.TargetArn;
            if (!target) {
                throw new Error("TopicArn or TargetArn is missing");
            }
            return this.convertPseudoParams(target);
        }
        else {
            return (0, helpers_1.validatePhoneNumber)(body.PhoneNumber);
        }
    };
    SNSServer.prototype.convertPseudoParams = function (topicArn) {
        var awsRegex = /#{AWS::([a-zA-Z]+)}/g;
        return topicArn.replace(awsRegex, this.accountId);
    };
    SNSServer.prototype.debug = function (msg) {
        if (msg instanceof Object) {
            try {
                msg = JSON.stringify(msg);
            }
            catch (ex) { }
        }
        this.pluginDebug(msg, "server");
    };
    return SNSServer;
}());
exports.SNSServer = SNSServer;
