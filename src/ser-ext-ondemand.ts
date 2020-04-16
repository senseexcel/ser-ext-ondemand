//#region Imports
import * as qvangular from "qvangular";
import * as qlik from "qlik";
import template from "./ser-ext-ondemand.html";
import aboutTemplate from "./lib/about.html";

import { OnDemandDirectiveFactory } from "./ser-ext-ondemandDirective";
import { propertyHelperLibaries, propertyHelperContent } from "./lib/utils";
import { ILibrary, ILayout } from "./lib/interfaces";
import { utils, services, version } from "./node_modules/davinci.js/dist/umd/daVinci";
import { isNull } from "util";
import { ETransportType, Logger } from "./lib/logger/index";
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

interface IVMScopeExtended extends utils.IVMScope<OnDemandExtension> {
    layout: ILayout;
    vm: OnDemandExtension;
}

let propertyScope: utils.IVMScope<OnDemandExtension>;

let properties = {
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
                            options: function (data: any) {
                                let label: string = null;
                                if (typeof (data.properties.templateContentLibrary) !== "undefined"
                                    && !isNull(data.properties.templateContentLibrary)) {
                                    label = data.properties.templateContentLibrary;
                                }

                                if ((typeof (label) === "number" || isNull(label))
                                    && typeof (data.properties.template) !== "undefined"
                                    && !isNull(data.properties.template)) {
                                    label = data.properties.template.split("/")[2];
                                }

                                if (isNull(label)) {
                                    label = "could not load content Libraries";
                                }

                                return propertyHelperLibaries<ILibrary[]>(
                                    propertyScope,
                                    "vm/content",
                                    50000,
                                    [{
                                        value: label,
                                        label: label
                                    }]
                                );
                            }
                        },
                        templateContent: {
                            ref: "properties.template",
                            label: "Content",
                            component: "dropdown",
                            options: function (data: any) {
                                let defaultLabel: string = null;
                                let defaultValue: string = null;

                                if (isNull(data.properties.templateContentLibrary)
                                    || typeof (data.properties.templateContentLibrary) === "undefined") {
                                    return [{
                                        value: "defaultValue",
                                        label: "defaultLable"
                                    }];
                                }

                                if (!isNull(data.properties.template)
                                    && typeof (data.properties.template) !== "undefined") {
                                    defaultValue = data.properties.template,
                                        defaultLabel = data.properties.template.split("/")[3];
                                }

                                return propertyHelperContent<ILibrary[]>(
                                    propertyScope,
                                    "vm/content",
                                    data.properties.templateContentLibrary,
                                    50000,
                                    [{
                                        value: defaultValue,
                                        label: defaultLabel
                                    }]
                                );

                            },
                            show: function (data: any) {
                                if (!isNull(data.properties.templateContentLibrary)
                                    && typeof (data.properties.templateContentLibrary) !== "undefined") {
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
                                label: "Excel (xlsx)"
                            }, {
                                value: "xlsb",
                                label: "Excel (xlsb)"
                            }, {
                                value: "docx",
                                label: "Word"
                            }, {
                                value: "pptx",
                                label: "PowerPoint"
                            }],
                            defaultValue: "pdf"
                        },
                        selection: {
                            type: "items",
                            grouped: false,
                            items: {
                                selectionMode: {
                                    ref: "properties.selection",
                                    label: "Selection Mode",
                                    component: "dropdown",
                                    options: [
                                        {
                                            value: 1,
                                            label: "Current Selections (new session - recommended)"
                                        },
                                        {
                                            value: 0,
                                            label: "Current Selections (shared session - experimantal)"
                                        },
                                        {
                                            value: 2,
                                            label: "Selections embedded in template"
                                        }
                                    ],
                                    defaultValue: 1
                                },
                                selectionModeDesc: {
                                    label: function (a) {
                                        let innerHtml = "";
                                        let message = $("div[tid='selectionModeDesc']")
                                        .find(".message");
                                        switch (a.properties.selection) {
                                            case 0:
                                                innerHtml = `
                                                    <span>Reporting connects to the same app session and uses the selections made in the app.</span>
                                                    </br>
                                                    <span>This method is experimantal and on some systems not working</span>
                                                    </br>
                                                    </br>
                                                    <span style="font-weight: bold;">Is not working for Analyzer User</span>
                                                `;
                                                break;
                                        
                                            case 1:
                                                innerHtml = `
                                                    <span>Reporting creates new session and the current selections are send to the new session by script</span>
                                                    </br>
                                                    </br>
                                                    <span style="font-weight: bold;">This method is recomended</span>
                                                `;
                                                break;

                                            default:
                                                innerHtml = `
                                                    <span>Reporting creates new session and takes the selection made in the template</span>
                                                `;
                                                break;
                                        }
                                        message.html(innerHtml);
                                    }, 
                                    type:"string",
                                    component: "text"
                                }
                            }
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
                        expertSettings: {
                            type: "boolean",
                            component: "switch",
                            label: "Activate Expert Settings",
                            ref: "properties.expertSettings",
                            options: [{
                                value: true,
                                label: "On"
                            }, {
                                value: false,
                                label: "Off"
                            }],
                            defaultValue: false
                        },
                        maxReportRuntime: {
                            ref: "properties.maxReportRuntime",
                            label: "Maximum Report Runtime (Minutes)",
                            default: 15,
                            type: "number",
                            expression: "optional",
                            show: function(a) {
                                return a.properties.expertSettings
                            }
                        },
                    }
                },
                options: {
                    type: "items",
                    label: "Options",
                    grouped: true,
                    items: {
                        calculationConditionFcn: {
                            ref: "properties.calculationConditionFcn",
                            label: "Calculation Condition",
                            type: "string",
                            expression: "optional"
                        },
                        calculationConditionText: {
                            ref: "properties.calculationConditionText",
                            label: "Text",
                            type: "string",
                            component: "textarea"
                        }
                    }
                },
                infos: {
                    type: "items",
                    label: "Info",
                    items: {
                        serAbout: {
                            label: function (a) {
                                const message = $("div[tid='serAbout']")
                                .find(".message");
                                if (message.length&&(!message[0].innerText||message[0].innerText==="")) {
                                    message.html(aboutTemplate);
                                }
                            }, 
                            type:"string",
                            component: "text"
                        }
                    }
                }
            }
        }
    }
};

class OnDemandExtension {

    model: EngineAPI.IGenericObject;
    scope: any;
    content: ILibrary[];
    logger: Logger;
    checkCalcCond: boolean = false;
    calcText: string = "";

    //#region mode
    private _mode: boolean;
    public get mode(): boolean {
        return this._mode;
    }
    public set mode(v: boolean) {
        if (this.mode !== v) {
            this._mode = v;

            this.getPropertyContent(this.model.app)
                .then((content) => {
                    this.content = content;
                })
                .catch((error) => {
                    this.logger.error("ERROR in setter of model in OnDemandExtension", error);
                });
        }
    }
    //#endregion

    constructor(scope: utils.IVMScope<OnDemandExtension>, logger: Logger) {
        this.logger = logger;
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

        this.model.on("changed", async () => {
            const objectProperties = await this.model.getProperties()
            let calcFcn = objectProperties.properties.calculationConditionFcn;
            let calcText: string = objectProperties.properties.calculationConditionText;

            if (typeof(calcFcn) === "undefined") {
                calcFcn = {}
            }

            if (!calcText || calcText.length === 0) {
                calcText = "calculation condition not fulfilled";
            }

            try {
                if (typeof((calcFcn as any).qStringExpression) !== "undefined") {
                let a = (calcFcn as any).qStringExpression.qExpr
                let b = await this.model.app.evaluateEx(a);

                    if (b.qNumber === -1) {
                        this.logger.debug("calculation condition fulfilled")
                        this.checkCalcCond = true;
                    } else {
                        this.logger.debug("calculation condition not fullfilled")
                        this.calcText = calcText;
                        this.checkCalcCond = false;
                    }
                } else {
                    this.logger.trace("no calculation condition set")
                    this.checkCalcCond = true;
                }
            } catch (error) {
                this.checkCalcCond = true;
                this.logger.error("Error in constructor of ser-ext-ondemand")
            }
        });
        this.model.emit("changed");
    }

    /**
     * checks if client is in edit or in analyse mode
     * @returns boolean, return true if client is in edit mode
     */
    public isEditMode(): boolean {
        if (qlik.navigation.getMode() === "analysis") {
            this.mode = false;
            return false;
        } else {
            this.mode = true;
            return true;
        }
    }

    private getPropertyContent(app: EngineAPI.IApp): Promise<ILibrary[]> {
        this.logger.debug("fcn called getPropertyContent");
        return new Promise((resolve, reject) => {
            let returnVal: ILibrary[] = [];
            app.getContentLibraries()
                .then((res: any) => {
                    let list: Array<EngineAPI.IContentLibraryListItem> = res;
                    let promAllContent: Promise<EngineAPI.IStaticContentList>[] = [];

                    for (const item of list) {
                        this.logger.debug("contentLibrary loaded: ", item.qName);

                        let label: string = item.qAppSpecific === true ? "in App" : item.qName;
                        let lib: ILibrary = {
                            label: label,
                            value: label,
                            content: []
                        };
                        returnVal.push(lib);
                        promAllContent.push(app.getLibraryContent(item.qName));
                    }
                    return Promise.all(promAllContent);
                })
                .then((res) => {
                    this.logger.debug("libary content loaded");
                    let counter = 0;

                    for (const contentLib of res) {
                        let items: EngineAPI.IStaticContentListItem[] = (contentLib as any);

                        for (const value of items) {
                            let last5: string = (value.qUrl as string).substr(value.qUrl.length - 5);
                            let last4: string = (value.qUrl as string).substr(value.qUrl.length - 4);

                            if (last4 === ".xls" || last5 === ".xlsx" || last5 === ".xlsb" || last5 === ".xlsm") {
                                let lib = (value.qUrl as string).split("/")[2];
                                let name = (value.qUrl as string).split("/")[3];

                                returnVal[counter].content.push({
                                    value: `content://${returnVal[counter].label === "in App" ? "" : lib}/${name}`,
                                    label: decodeURI(name)
                                });
                            }
                        }
                        counter++;
                    }
                    resolve(returnVal);
                })
                .catch((error) => {
                    reject(error);
                });
        });
    }
}

export = {
    definition: properties,
    initialProperties: {},
    template: template,
    paint: () => {
        // empty function to avoid braking when paint method is required
    },
    resize: () => {
        // empty function to avoid braking when resize method is required
    },
    controller: ["$scope", function (scope: IVMScopeExtended) {

        let logger = new Logger({
            baseComment: "ser-ext-ondemand",
            loglvl: scope.layout.properties.loglevel,
            transports: [
                {
                    showBaseComment: true,
                    showDate: true,
                    showLoglevel: true,
                    type: ETransportType.console
                }
            ]
        });

        propertyScope = scope;
        scope.vm = new OnDemandExtension(scope, logger);
    }]
};