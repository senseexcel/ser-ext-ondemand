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
logging.LogConfig.SetLogLevel("*", logging.LogLevel.warn);
let logger = new logging.Logger("Main");
//#endregion

//#region Directives
var $injector = qvangular.$injector;
utils.checkDirectiveIsRegistrated($injector, qvangular, "", BookmarkDirectiveFactory("Ondemandextension"),
    "OndemandExtension");
//#endregion

//#region interfaces
interface IDataLabel {
    label: string;
    value: string | number;
}

interface IPropertyContent {
    dataLib: IDataLabel[];
    dataCon: IDataLabel[];
}
//#endregion

function getListOfLib(app: EngineAPI.IApp): any {
    app.getContentLibraries()
    .then((res) => {
        let list: Array<EngineAPI.IContentLibraryListItem> = res as any;
        let returnVal = [];

        for (const item of list) {
            returnVal.push({
                value: item.qName,
                label: decodeURI(item.qName)
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
                        },
                        directDownload: {
                            type: "boolean",
                            component: "switch",
                            label: "Direct Download",
                            ref: "properties.directDownload",
                            options: [{
                                value: true,
                                label: "On"
                            }, {
                                value: false,
                                label: "Not On"
                            }],
                            defaultValue: false
                            }
                    }
                }
            }
        }
    }
};
//#endregion


class OnDemandExtension {

    model: EngineAPI.IGenericObject;
    scope: any;

    //#region mode
    private _mode : boolean;
    public get mode() : boolean {
        return this._mode;
    }
    public set mode(v : boolean) {
        if (this.mode !== v) {
            this._mode = v;
            try {

                getPropertyContent(this.model.app)
                .then((res) => {
                    (this.scope as any).dataLib = res.dataLib;
                    (this.scope as any).dataCon = res.dataCon;
                })
                .catch((error) => {
                    console.error("ERROR", error);
                });

            } catch (error) {
                console.error("E");
            }
        }

    }
    //#endregion

    constructor(model: EngineAPI.IGenericObject, scope: any) {
        this.model = model;
        this.scope = scope;
    }

    public isEditMode() {
        if (qlik.navigation.getMode() === "analysis") {
            this.mode = false;
            return false;
        } else {
            this.mode = true;
            return true;
        }
    }

}

export = {
    definition: parameter,
    initialProperties: { },
    template: template,
    controller: ["$scope", function (scope: utils.IVMScope<OnDemandExtension>) {
        scope2 = scope as any;
        scope.vm = new OnDemandExtension(utils.getEnigma(scope), scope);

        let app: EngineAPI.IApp = scope.vm.model.app;

        getPropertyContent(app)
        .then((res) => {
            (scope as any).dataLib = res.dataLib;
            (scope as any).dataCon = res.dataCon;
        })
        .catch((error) => {
            console.error("ERROR", error);
        });
    }]
};

function getPropertyContent(app: EngineAPI.IApp): Promise<IPropertyContent> {
    return new Promise((resolve, reject) => {
        app.getContentLibraries()
        .then((res: any) => {
            let list: Array<EngineAPI.IContentLibraryListItem> = res;
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
                                label: decodeURI(name)
                            });
                        }
                    }

                })
                .catch((error) => {
                    console.error("ERROR", error);
                });

                returnValContent.push(items);
            }


            resolve({
                dataLib: returnVal,
                dataCon: returnValContent
            });
        })
        .catch((error) => {
            reject(error);
        });
    });
}