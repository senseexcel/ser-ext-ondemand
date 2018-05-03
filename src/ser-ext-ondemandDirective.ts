//#region imports
import { utils, logging, directives } from "./node_modules/davinci.js/dist/umd/daVinci";
import * as template from "text!./ser-ext-ondemandDirective.html";
import "css!./ser-ext-ondemandDirective.css";
//#endregion

//#region enums
enum SERState {
    running,
    finished,
    ready,
    error,
    serNotRunning,
    serNoConnectionQlik
}
//#endregion

//#region interfaces
interface ISERResponseStart {
    TaskId: string;
}

interface ISERResponseStatus {
    Status: number;
    Log: string;
    Link: string;
    TaskId: string;
}

interface ISERRequestStatus {
    TaskId?: string;
}

interface ISERRequestStart {
    tasks: ISERTask[];
}

interface ISERTask {
    general: ISERGeneral;
    connection: ISERConnection;
    template: ISERTemplate;
    distribute: ISERDistribute;

}

interface ISERGeneral {
    useUserSelections: string;
}

interface ISERConnection {
    sharedSession: boolean;
    app: string;
}

interface ISERTemplate {
    input: string;
    output: string;
    outputFormat: string;
    selections?: ISERSelection[];
}

interface ISERDistribute {
    hub: ISERHub;
}

interface ISERHub {
    mode: string;
    connection: string;
}

interface ISERSelection {
    type: string;
    objectType: string;
    values: string;
}

interface IProperties {
    template: string;
    output: string;
    selection: number;
    directDownload: boolean;
}
//#endregion

class OnDemandController implements ng.IController {

    //#region variables
    appId: string;
    bookmarkId: string = "serBookmarkOnDemand";
    clicked: boolean = false;
    editMode: boolean;
    element: JQuery;
    host: string;
    interval: number;
    intervalShort: number = 3000;
    intervalLong: number = 5000;
    link: string;
    properties: IProperties = {
        template: " ",
        output: " ",
        selection: 0,
        directDownload: false
    };
    running: boolean = false;
    title: string = "Generate Report";
    taskId: string;
    timeout: ng.ITimeoutService;
    timeoutAfterStop: number = 2000;
    //#endregion

    //#region logger
    private _logger: logging.Logger;
    private get logger(): logging.Logger {
        if (!this._logger) {
            try {
                this._logger = new logging.Logger("OnDemandController");
            } catch (error) {
                console.error("ERROR in create logger instance", error);
            }
        }
        return this._logger;
    }
    //#endregion

    //#region state
    private _state : SERState;
    public get state() : SERState {
        if (typeof(this._state)!=="undefined") {
            return this._state;
        }
        return SERState.ready;
    }
    public set state(v : SERState) {
        if (v !== this._state) {
            this._state = v;

            this.logger.debug("STATE: ", v);

            switch (v) {
                case SERState.ready:
                    this.running = false;
                    this.clicked = false;
                    setTimeout(() => {
                        this.link = null;
                    }, 1000);
                    this.title  = "Generate Report";
                    break;

                case SERState.running:
                    this.running = true;
                    this.title  = "Running ... (click to abort)";
                    break;

                case SERState.finished:

                    this.running = false;
                    this.clicked = false;

                    this.title  = "Download Report";
                    if (this.properties.directDownload) {
                        this.action();
                    }

                    clearInterval(this.interval);
                    this.setInterval(this.intervalLong);
                    break;

                case SERState.serNotRunning:
                    this.running = false;
                    this.clicked = false;
                    this.title  = "SER not available";
                    break;

                case SERState.serNoConnectionQlik:
                    this.running = false;
                    this.clicked = false;
                    this.title = "SER no connection to Qlik";

                default:
                    this.running = false;
                    this.clicked = false;
                    this.title = "Error while running - Retry";
                    break;
            }
        }
    }
    //#endregion

    //#region model
    private _model: EngineAPI.IGenericObject;
    get model(): EngineAPI.IGenericObject {
        return this._model;
    }
    set model(value: EngineAPI.IGenericObject) {
        if (value !== this._model) {
            try {
                this._model = value;
                this.model.app.getAppLayout()
                    .then((res) => {
                        this.appId = res.qFileName;
                    })
                .catch((error) => {
                    this.logger.error("ERROR", error);
                });

                var that = this;
                value.on("changed", function () {
                    value.getProperties()
                        .then((res) => {
                            that.setProperties(res.properties);
                        })
                        .catch( (error) => {
                            this.logger.error("ERROR in setter of model ", error);
                    });
                });
                value.emit("changed");
            } catch (error) {
                this.logger.error("ERROR in setter of model", error);
            }
        }
    }
    //#endregion

    $onInit(): void {
        this.logger.debug("initialisation from BookmarkController");
    }

    static $inject = ["$timeout", "$element", "$scope"];

    /**
     * init of the controller for the Directive
     * @param timeout
     * @param element
     * @param scope
     */
    constructor(timeout: ng.ITimeoutService, element: JQuery, scope: ng.IScope) {
        this.element = element;
        this.timeout = timeout;

        let hostArr: Array<string> = ((this.model as any).session.config.url as string).split("/");
        this.host = `${hostArr[0]==="wss:"?"https":"http"}://${hostArr[2]}${hostArr[3]!=="app"?"/"+hostArr[3]:""}`;

        this.getStatus(this.taskId);
        this.setInterval(this.intervalLong);
    }

    //#region private function
    private setInterval(intervalTime: number): void {
        this.interval = setInterval(() => {
            this.getStatus(this.taskId);
        }, intervalTime);
    }

    private createRequest(): ISERRequestStart {
        let general: ISERGeneral = {
            useUserSelections: "OnDemandOn"
        };
       let connection: ISERConnection;
        let template: ISERTemplate = {
            input: this.properties.template,
            output: "OnDemand",
            outputFormat: this.properties.output
        };

        switch (this.properties.selection) {
            case 0:
                connection = {
                    app: this.appId,
                    sharedSession: true
                };
                general.useUserSelections = "OnDemandOn";
                break;

            case 1:
                connection = {
                    app: this.appId,
                    sharedSession: false
                };
                general.useUserSelections = "OnDemandOff";
                template = {
                    input: this.properties.template,
                    output: "OnDemand",
                    outputFormat: this.properties.output,
                    selections: [{
                        type: "static",
                        objectType: "ser-bookmark",
                        values: this.bookmarkId
                    }]
                };
                break;

            case 2:
                general.useUserSelections = "Normal";
                connection = {
                    app: this.appId,
                    sharedSession: false
                };
                break;
            default:
                break;
        }

        return {
            tasks: [{
                general: general,
                connection: connection,
                template: template,
                distribute: {
                    hub: {
                        connection: "@CONFIGCONNECTION@",
                        mode: "Override"
                    }
                }
            }]
        };
    }

    private start (): void {

        this.checkAndDeleteExistingBookmark(this.bookmarkId)
            .then(() => {
                return this.createBookmark(this.bookmarkId);
            })
            .then(() => {
                let requestJson: ISERRequestStart = this.createRequest();
                let serCall: string = `SER.Start('${JSON.stringify(requestJson)}')`;
                this.logger.debug("call fcn createRepor", serCall);

                return this.model.app.evaluate(serCall);
            })
            .then((response) => {
               let statusObject: ISERResponseStart;
                try {
                    statusObject = JSON.parse(response);
                } catch (error) {
                    this.logger.error("error", error);
                }
                this.logger.debug("taskId:", statusObject.TaskId);

                if(typeof(statusObject) === "undefined" || statusObject.TaskId === "-1") {
                    this.title = "Wrong Task ID - Retry";
                    return;
                }
                this.taskId = statusObject.TaskId;

                clearInterval(this.interval);
                this.setInterval(this.intervalShort);
            })
        .catch((error) => {
            this.logger.error("ERROR in createReport", error);
        });
    }

    private createBookmark (id: string): Promise<string> {
        return new Promise((resolve, reject) => {
            let bookmarkProperties: EngineAPI.IGenericBookmarkProperties =  {
                qInfo: {
                    qType: "ser-bookmark",
                    qId: id
                },
                qMetaDef: {
                    title: id
                },
                creationDate: (new Date()).toISOString()
            };

            this.model.app.createBookmark(bookmarkProperties)
                .then((bookmarkObject) => {
                    return this.model.app.doSave();
                })
                .then(() => {
                    resolve(this.bookmarkId);
                })
            .catch((error) => {
                this.logger.error("ERROR in create Bookmark", error);
                reject(error);
            });
        });
    }

    private checkAndDeleteExistingBookmark(id: string): Promise<void> {
        return new Promise((resolve, reject) => {
            this.model.app.destroyBookmark(id)
                .then((checker) => {
                    this.logger.debug("Result destroy bookmark", checker);
                    resolve();
                })
            .catch((error) => {
                this.logger.error("ERROR in checkAndDeleteExistingBookmark", error);
                reject(error);
            });
        });
    }

    private setProperties (properties: IProperties): Promise<void> {
        this.logger.debug("setProperties", properties);
        return new Promise((resolve, reject) => {
            try {
                this.properties.template = properties.template;
                this.properties.selection = properties.selection;
                this.properties.output = properties.output;
                this.properties.directDownload = properties.directDownload;
                resolve();
            } catch (error) {
                reject(error);
            }
        });
    }

    private getStatus (taskId: string) {
        let reqestJson: ISERRequestStatus = {};
        if (typeof(taskId)!=="undefined") {
            reqestJson = {
                "TaskId": `${taskId}`
            };
        }

        let serCall: string = `SER.Status('${JSON.stringify(reqestJson)}')`;
        this.logger.debug("call fcn getStatus", serCall);

        this.model.app.evaluate(serCall)
            .then((response) => {
                let statusObject: ISERResponseStatus;
                this.logger.debug("response from status call", response);

                try {
                    if (response.indexOf("Error in expression")!==-1) {
                        this.logger.warn(response);
                        this.state = SERState.serNotRunning;
                        return;
                    }
                } catch (error) {
                    this.logger.error("ERROR", error);
                    return;
                }

                try {
                    statusObject = JSON.parse(response);
                } catch (error) {
                    this.logger.error("Error log from SER: ", response);
                    this.state = SERState.error;
                }

                if(typeof(statusObject.TaskId)!=="undefined") {
                    this.taskId = statusObject.TaskId;
                }

                switch (statusObject.Status) {
                    case -2:
                        this.state = SERState.serNoConnectionQlik;
                        break;
                    case -1:
                        this.state = SERState.error;
                        break;
                    case 0:
                        this.state = SERState.ready;
                        break;
                   case 1:
                        this.state = SERState.running;
                        break;
                    case 2:
                        this.state = SERState.running;
                        break;
                    case 3:
                        this.link = `${this.host}${statusObject.Link}`;
                        this.state = SERState.finished;
                        break;

                    default:
                        this.state = SERState.error;
                        break;
                }
            })
        .catch((error) => {
            this.state = SERState.serNotRunning;
            this.logger.error("ERROR", error);
        });
    }

    private stopReport() {
        let reqestJson: ISERRequestStatus = {
           "TaskId": `${this.taskId}`
        };

        let serCall: string = `SER.Stop('${JSON.stringify(reqestJson)}')`;

        this.logger.debug("call fcn abortReport", serCall);
        this.model.app.evaluate(serCall)
            .then(() => {
              this.logger.debug("report generation aborted");
            })
        .catch((error) => {
            this.logger.error("ERROR in abortRepot", error);
            this.state = SERState.error;
        });
    }
    //#endregion

    //#region public functions

    /**
     * controller function for click actions
     */
    public action () {
        if (this.state === 4) {
            return;
        }
        switch (this.state) {
            case SERState.ready:
                this.clicked = true;
                this.running = true;
                this.title = "Running ... (click to abort)";
                this.start();
                break;
            case SERState.running:
            this.title = "Aborting ... ";
                this.stopReport();
                break;
            case SERState.finished:
                this.title = "Generate Report";
                this.state = SERState.ready;
                window.open(this.link, "_blank");
                this.stopReport();
                break;
            default:
                this.clicked = true;
                this.stopReport();
                this.title = "Running ... (click to abort)";
                setTimeout(() => {
                    this.start();
                }, this.timeoutAfterStop);
                break;
        }
    }

    /**
     * isEditMode
     */
    public isEditMode(): boolean {
        if (this.editMode) {
            return true;
        }
        return false;
    }
    //#endregion

}

export function BookmarkDirectiveFactory(rootNameSpace: string): ng.IDirectiveFactory {
    "use strict";
    return ($document: ng.IAugmentedJQuery, $injector: ng.auto.IInjectorService, $registrationProvider: any) => {
        return {
            restrict: "E",
            replace: true,
            template: utils.templateReplacer(template, rootNameSpace),
            controller: OnDemandController,
            controllerAs: "vm",
            scope: {},
            bindToController: {
                model: "<",
                theme: "<?",
                editMode: "<?"
            },
            compile: ():void => {
                utils.checkDirectiveIsRegistrated($injector, $registrationProvider, rootNameSpace,
                    directives.IdentifierDirectiveFactory(rootNameSpace), "Identifier");
                utils.checkDirectiveIsRegistrated($injector, $registrationProvider, rootNameSpace,
                    directives.ShortCutDirectiveFactory(rootNameSpace), "Shortcut");
            }
        };
    };
}


