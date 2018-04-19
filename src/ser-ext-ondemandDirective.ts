//#region imports
import { utils, logging, directives } from "./node_modules/davinci.js/dist/umd/daVinci";
import * as template from "text!./ser-ext-ondemandDirective.html";
import "css!./ser-ext-ondemandDirective.css";
//#endregion

//#region enums
enum SERState {
    loading,
    finished,
    ready,
    error
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
    app?: string;
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
}
//#endregion

class OnDemandController implements ng.IController {

    //#region variables
    appId: string;
    editMode: boolean;
    element: JQuery;
    link: string;
    properties: IProperties = {
        template: " ",
        output: " ",
        selection: 0
    };
    reportError = false;
    refreshIntervalId: number;
    refreshIntervalTime: number;
    running: boolean = false;
    status: string = "Generate Report";
    taskId: string;
    timeout: ng.ITimeoutService;
    bookmarkId: string;
    host: string;
    intervalShort: number = 3000;
    intervalLong: number = 5000;

    // taskRunning: boolean = false;

    interval: number;
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
            console.log("STATE", v);
            this._state = v;
            if (v === SERState.error) {
                this.running = false;
                this.reportError = true;
                clearInterval(this.interval);
                this.status = "Error while running - Retry";
                this.state = SERState.ready;
            }
            if (v === SERState.finished) {
                this.running = false;
                clearInterval(this.interval);
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
        this.status = "Generate Report";
        this.element = element;
        this.timeout = timeout;
        this.refreshIntervalTime = 2000;
        this.bookmarkId = "serBookmarkOnDemand";

        let hostArr: Array<string> = ((this.model as any).session.config.url as string).split("/");
        this.host = `${hostArr[0]==="wss:"?"https":"http"}://${hostArr[2]}${hostArr[3]!=="app"?"/"+hostArr[3]:""}`;

        this.logger.info("host", hostArr);
        this.logger.info("host", this.host);

        this.setInterval(this.intervalLong);
    }

    //#region private function
    private setInterval(intervalTime: number): void {
        this.interval = setInterval(() => {
            this.logger.debug("intervall");
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
                        objectType: "bookmark",
                        values: this.bookmarkId
                    }]
                };
                break;

            case 2:
                general.useUserSelections = "Normal";
                connection = {
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
        this.running = true;

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
                    this.status = "Wrong Task ID - Retry";
                    this.reportError = true;
                    return;
                }
                this.taskId = statusObject.TaskId;
                this.status = "Running ...  (click to abort)";

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
                    title: "onDemand"
                },
                creationDate: (new Date()).toISOString()
            };

            this.model.app.createBookmark(bookmarkProperties)
                .then((bookmarkObject) => {
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
                        this.logger.error(response);
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

                console.log("STATUSOBJECT", statusObject.Status);
                console.log("RUNNING", this.running);
                switch (statusObject.Status) {
                    case -1:
                        if (this.running) {
                            this.state = SERState.error;
                        }
                        this.state = SERState.ready;
                        break;
                    case 1:
                        this.status = "Running ... (click to abort)";
                        this.state = SERState.loading;
                        break;
                    case 2:
                        this.status = "Start uploading ...(click to abort)";
                        this.state = SERState.loading;
                        break;
                    case 3:
                        this.status = "Uploading finished ...(click to abort)";
                        this.state = SERState.loading;
                        break;
                    case 4:
                        this.status = "Aborted (click to start again)";
                        this.state = SERState.finished;
                        break;
                    case 5:
                        this.status = "Download Report";
                        this.link = `${this.host}${statusObject.Link}`;
                        this.state = SERState.finished;
                        break;
                    default:
                        this.state = SERState.error;
                        break;
                }
            })
        .catch((error) => {
            this.state = SERState.error;
            this.logger.error("ERROR", error);
        });
    }

    private abortReport() {
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
    action () {
        this.reportError = false;
        this.status = "Running ... (click to abort)";
        switch (this.state) {
            case SERState.ready:
                this.start();
                break;
            case SERState.loading:
                this.abortReport();
                break;
            case SERState.finished:
                this.status = "Generate Report";
                this.state = SERState.ready;
                setTimeout(() => {
                    this.link = null;
                }, 1000);
                break;
            default:
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