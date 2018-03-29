(function (factory) {
    if (typeof module === "object" && typeof module.exports === "object") {
        var v = factory(require, exports);
        if (v !== undefined) module.exports = v;
    }
    else if (typeof define === "function" && define.amd) {
        define(["require", "exports", "qvangular", "qlik", "text!./ser-ext-ondemand.html", "./node_modules/davinci.js/dist/umd/daVinci", "./ser-ext-ondemandDirective"], factory);
    }
})(function (require, exports) {
    "use strict";
    //#region Imports
    var qvangular = require("qvangular");
    var qlik = require("qlik");
    var template = require("text!./ser-ext-ondemand.html");
    var daVinci_1 = require("./node_modules/davinci.js/dist/umd/daVinci");
    var ser_ext_ondemandDirective_1 = require("./ser-ext-ondemandDirective");
    //#endregion
    //#region registrate services
    qvangular.service("$registrationProvider", daVinci_1.services.RegistrationProvider)
        .implementObject(qvangular);
    //#endregion
    //#region Logger
    daVinci_1.logging.LogConfig.SetLogLevel("*", daVinci_1.logging.LogLevel.debug);
    var logger = new daVinci_1.logging.Logger("Main");
    //#endregion
    //#region Directives
    var $injector = qvangular.$injector;
    daVinci_1.utils.checkDirectiveIsRegistrated($injector, qvangular, "", ser_ext_ondemandDirective_1.BookmarkDirectiveFactory("Ondemandextension"), "OndemandExtension");
    //#endregion
    function getListOfLib(app) {
        app.getContentLibraries()
            .then(function (res) {
            var list = res;
            var returnVal = [];
            for (var _i = 0, list_1 = list; _i < list_1.length; _i++) {
                var item = list_1[_i];
                returnVal.push({
                    value: item.qName,
                    label: item.qName
                });
            }
            return returnVal;
        })
            .catch(function (error) {
            console.error("ERROR", error);
        });
    }
    var scope2;
    //#region extension properties
    var parameter = {
        type: "items",
        component: "accordion",
        items: {
            settings: {
                uses: "settings",
                items: {
                    config: {
                        type: "items",
                        label: "Configuration",
                        grouped: true,
                        items: {
                            templateContentLibrary: {
                                ref: "properties.templateContentLibrary",
                                label: "choose Library",
                                component: "dropdown",
                                options: function () {
                                    return scope2.dataLib;
                                }
                            },
                            templateContent: {
                                ref: "properties.template",
                                label: "choose Content",
                                component: "dropdown",
                                options: function (a) {
                                    return scope2.dataCon[a.properties.templateContentLibrary];
                                },
                                show: function (data) {
                                    if (data.properties.templateContentLibrary !== null) {
                                        return true;
                                    }
                                    return false;
                                }
                            },
                            output: {
                                ref: "properties.output",
                                label: "which output format",
                                component: "dropdown",
                                options: [{
                                        value: "pdf",
                                        label: "PDF"
                                    }, {
                                        value: "xlsx",
                                        label: "Excel"
                                    }],
                                defaultValue: "pdf"
                            },
                            useSelection: {
                                ref: "properties.useSelection",
                                label: "use current selection",
                                type: "boolean",
                                component: "switch",
                                options: [{
                                        value: true,
                                        label: "Use"
                                    }, {
                                        value: false,
                                        label: "Not Use"
                                    }],
                                defaultValue: true
                            }
                        }
                    }
                }
            }
        }
    };
    //#endregion
    var OnDemanExtension = /** @class */ (function () {
        function OnDemanExtension(model) {
            this.model = model;
        }
        OnDemanExtension.prototype.isEditMode = function () {
            if (qlik.navigation.getMode() === "analysis") {
                return false;
            }
            else {
                return true;
            }
        };
        return OnDemanExtension;
    }());
    return {
        definition: parameter,
        initialProperties: {},
        template: template,
        controller: ["$scope", function (scope) {
                scope2 = scope;
                scope.vm = new OnDemanExtension(daVinci_1.utils.getEnigma(scope));
                var app = scope.vm.model.app;
                app.getContentLibraries()
                    .then(function (res) {
                    var list = res;
                    var returnVal = [];
                    var returnValContent = [];
                    var index = 0;
                    var _loop_1 = function (item) {
                        var inApp = false;
                        if (item.qAppSpecific === true) {
                            inApp = true;
                        }
                        returnVal.push({
                            value: index,
                            label: item.qAppSpecific === true ? "in App" : item.qName
                        });
                        index++;
                        var items = [];
                        app.getLibraryContent(item.qName)
                            .then(function (content) {
                            for (var _i = 0, content_1 = content; _i < content_1.length; _i++) {
                                var value = content_1[_i];
                                var last5 = value.qUrl.substr(value.qUrl.length - 5);
                                var last4 = value.qUrl.substr(value.qUrl.length - 4);
                                if (last4 === ".xls" || last5 === ".xlsx") {
                                    var lib = value.qUrl.split("/")[2];
                                    var name_1 = value.qUrl.split("/")[3];
                                    items.push({
                                        value: "content://" + (inApp === true ? "" : lib) + "/" + name_1,
                                        label: name_1
                                    });
                                }
                            }
                        })
                            .catch(function (error) {
                            console.error("ERROR", error);
                        });
                        returnValContent.push(items);
                    };
                    for (var _i = 0, list_2 = list; _i < list_2.length; _i++) {
                        var item = list_2[_i];
                        _loop_1(item);
                    }
                    scope.dataLib = returnVal;
                    scope.dataCon = returnValContent;
                })
                    .catch(function (error) {
                    console.error("ERROR", error);
                });
            }]
    };
});
//# sourceMappingURL=ser-ext-ondemand.js.map