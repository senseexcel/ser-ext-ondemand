//#region Imports
import * as qvangular from "qvangular";
import * as qlik from "qlik";
import * as template from "text!./ser-ext-ondemandExtension.html";
import { utils, logging, services, version } from "../node_modules/davinci.js/dist/umd/daVinci";
import { BookmarkDirectiveFactory } from "./ser-ext-ondemandDirective";
//#endregion

//#region registrate services
qvangular.service<services.IRegistrationProvider>("$registrationProvider", services.RegistrationProvider)
.implementObject(qvangular);
//#endregion

//#region Logger
logging.LogConfig.SetLogLevel("*", logging.LogLevel.info);
let logger = new logging.Logger("Main");
//#endregion

//#region Directives
var $injector = qvangular.$injector;
utils.checkDirectiveIsRegistrated($injector, qvangular, "", BookmarkDirectiveFactory("Ondemandextension"),
    "OndemandExtension");
//#endregion

//#region extension properties
let parameter = {
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
                        template: {
                            ref: "properties.template",
                            label: "enter the template name",
							component: "textarea",
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

class OnDemanExtension {

    model: EngineAPI.IGenericObject;

    constructor(model: EngineAPI.IGenericObject) {
        this.model = model;
    }

    public isEditMode() {
        if (qlik.navigation.getMode() === "analysis") {
            return false;
        } else {
            return true;
        }
    }

}

export = {
    definition: parameter,
    initialProperties: { },
    template: template,
    controller: ["$scope", function (scope: utils.IVMScope<OnDemanExtension>) {
        scope.vm = new OnDemanExtension(utils.getEnigma(scope));
    }]
};


