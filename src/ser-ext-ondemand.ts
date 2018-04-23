//#region Imports
import * as qvangular from "qvangular";
import * as qlik from "qlik";
import * as template from "text!./ser-ext-ondemand.html";
import { utils, logging, services, version } from "./node_modules/davinci.js/dist/umd/daVinci";
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

function getListOfLib(app: EngineAPI.IApp): any {
    app.getContentLibraries()
    .then((res) => {
        let list: Array<EngineAPI.IContentLibraryListItem> = res as any;
        let returnVal = [];

        for (const item of list) {
            returnVal.push({
                value: item.qName,
                label: item.qName
            });
        }

        return returnVal;

    })
    .catch((error) => {
        console.error("ERROR", error);
    });
}

let scope2 : any;

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
                        templateContentLibrary: {
                            ref: "properties.templateContentLibrary",
                            label: "choose Library",
                            component: "dropdown",
                            options: function()
                            {
                                return scope2.dataLib;
                            }
                        },
                        templateContent: {
                            ref: "properties.template",
                            label: "choose Content",
                            component: "dropdown",
                            options: function(a: any)
                            {
                                return scope2.dataCon[a.properties.templateContentLibrary];
                            },
                            show: function (data: any) {
                                if (data.properties.templateContentLibrary!==null) {
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
                        selection: {
                            ref: "properties.selection",
                            label: "choose selection mode",
                            component: "dropdown",
                            options: [{
                                value: 0,
                                label: "Selection over shared session"
                            }, {
                                value: 1,
                                label: "Selection over bookmark"
                            }, {
                                value: 2,
                                label: "not Use"
                            }, ],
                            defaultValue: 0
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
        scope2 = scope as any;
        scope.vm = new OnDemanExtension(utils.getEnigma(scope));

        let app: EngineAPI.IApp = scope.vm.model.app;

        app.getContentLibraries()
        .then((res) => {
            let list: Array<EngineAPI.IContentLibraryListItem> = res as any;
            let returnVal = [];
            let returnValContent = [];

            let index: number = 0;
            for (const item of list) {
                let inApp: boolean = false;
                if (item.qAppSpecific === true) {
                    inApp = true;
                }
                returnVal.push({
                    value: index,
                    label: item.qAppSpecific===true?"in App":item.qName
                });
                index++;

                let items = [];

                app.getLibraryContent(item.qName)
                .then((content: any) => {

                    for (const value of content) {

                        let last5: string = (value.qUrl as string).substr(value.qUrl.length - 5);
                        let last4: string = (value.qUrl as string).substr(value.qUrl.length - 4);

                        if (last4 === ".xls" || last5 === ".xlsx") {
                            let lib = (value.qUrl as string).split("/")[2];
                            let name = (value.qUrl as string).split("/")[3];
                            items.push({
                                value: `content://${inApp===true?"":lib}/${name}`,
                                label: name
                            });
                        }
                    }

                })
                .catch((error) => {
                    console.error("ERROR", error);
                });

                returnValContent.push(items);
            }
            (scope as any).dataLib = returnVal;
            (scope as any).dataCon = returnValContent;
        })
        .catch((error) => {
            console.error("ERROR", error);
        });
    }]
};


