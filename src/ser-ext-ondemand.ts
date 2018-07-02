//#region Imports
import * as qvangular                   from "qvangular";
import * as qlik                        from "qlik";
import * as template                    from "text!./ser-ext-ondemand.html";

import { OnDemandDirectiveFactory }     from "./ser-ext-ondemandDirective";

import { IPropertyContent,
         IDataLabel }                   from "./lib/interfaces";
import { utils,
         logging,
         services,
         version }                      from "./node_modules/davinci.js/dist/umd/daVinci";
//#endregion

//#region registrate services
qvangular.service<services.IRegistrationProvider>("$registrationProvider", services.RegistrationProvider)
.implementObject(qvangular);
//#endregion

//#region Directives
var $injector = qvangular.$injector;
utils.checkDirectiveIsRegistrated($injector, qvangular, "", OnDemandDirectiveFactory("Ondemandextension"),
    "OndemandExtension");
//#endregion

let scope2 : utils.IVMScope<OnDemandExtension>;

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
                            label: "Library",
                            component: "dropdown",
                            options: function(data: any)
                            {
                                if (typeof(scope2.vm.content)!=="undefined") {
                                    return scope2.vm.content.dataLib;
                                }
                                return [{value: data.properties.templateContentLibrary, label: data.properties.templateContentLibrary}];
                            }
                        },
                        templateContent: {
                            ref: "properties.template",
                            label: "Content",
                            component: "dropdown",
                            options: function(data: any)
                            {
                                if (typeof(scope2.vm.content)!=="undefined") {
                                    let counter = 0;
                                    for (const library of scope2.vm.content.dataLib) {
                                        if (library.value === data.properties.templateContentLibrary) {
                                            return scope2.vm.content.dataCon[counter];
                                        }
                                        counter++;
                                    }
                                }
                                let defaultRes: string = decodeURI(data.properties.template.split("/")[3]);
                                return [{value: data.properties.template, label: defaultRes}];
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
                            label: "Output Format",
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
                            label: "Selection Mode",
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
                        },
                        loglevel: {
                            ref: "properties.loglevel",
                            label: "loglevel",
                            component: "dropdown",
                            options: [{
                                value: 0,
                                label: "trace"
                            }, {
                                value: 1,
                                label: "debug"
                            }, {
                                value: 2,
                                label: "info"
                            }, {
                                value: 3,
                                label: "warn"
                            }, {
                                value: 4,
                                label: "error"
                            }, {
                                value: 5,
                                label: "fatal"
                            }, {
                                value: 6,
                                label: "off"
                            }],
                            defaultValue: 3
                        },
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
    content : IPropertyContent;

    //#region logger
    private _logger: logging.Logger;
    private get logger(): logging.Logger {
        if (!this._logger) {
            try {
                this._logger = new logging.Logger("OnDemandExtension");
            } catch (error) {
                console.error("ERROR in create logger instance", error);
            }
        }
        return this._logger;
    }
    //#endregion

    //#region mode
    private _mode : boolean;
    public get mode() : boolean {
        return this._mode;
    }
    public set mode(v : boolean) {
        if (this.mode !== v) {
            this._mode = v;

            this.getPropertyContent(this.model.app)
            .then((content) => {
                this.content = content;
            })
            .catch((error) => {
                this.logger.error("ERROR in constructor of OnDemandExtension", error);
            });
        }
    }
    //#endregion

    constructor(scope: utils.IVMScope<OnDemandExtension>) {
        this.logger.info(`onDemandExtension loaded and uses daVinci Version ${version}`, "");

        this.scope = scope;
        this.model = utils.getEnigma(scope);

        this.getPropertyContent(this.model.app)
        .then((content) => {
            this.content = content;
        })
        .catch((error) => {
            this.logger.error("ERROR in constructor of OnDemandExtension", error);
        });

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

    private  getPropertyContent(app: EngineAPI.IApp): Promise<IPropertyContent> {
        return new Promise((resolve, reject) => {
            app.getContentLibraries()
            .then((res: any) => {
                let list: Array<EngineAPI.IContentLibraryListItem> = res;
                let returnVal: IDataLabel[] = [];
                let returnValContent: IDataLabel[][] = [];
                let index: number = 0;
                for (const item of list) {
                    let inApp: boolean = false;
                    if (item.qAppSpecific === true) {
                        inApp = true;
                    }
                    returnVal.push({
                        value: item.qAppSpecific===true?"in App":item.qName,
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

}

export = {
    definition: parameter,
    initialProperties: { },
    template: template,
    paint: () => {
        //
    },
    resize: () => {
        //
    },
    controller: ["$scope", function (scope: utils.IVMScope<OnDemandExtension>) {

        //#region Logger
        logging.LogConfig.SetLogLevel("*", (scope as any).layout.properties.loglevel);
        let logger = new logging.Logger("Main");
        //#endregion

        scope2 = scope as any;
        scope.vm = new OnDemandExtension(scope);
    }]
};