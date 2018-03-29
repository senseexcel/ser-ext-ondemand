//#region imports
import { utils, logging, directives } from "../node_modules/davinci.js/dist/umd/daVinci";
import * as template from "text!./ser-ext-ondemandDirective.html";
import "css!./main.css";
//#endregion

enum SERState {
    loading,
    finished,
    ready,
    error
}

interface ISERResponseCreate {
    TaskId: string;
}

interface ISERResponseStatus {
    Status: number;
    Log: string;
    Link: string;
}

interface ISERRequestStatus {
    TaskId: string;
}

class OnDemandController implements ng.IController {

    status: string = "Generate Report";
    link: string;
    editMode: boolean;
    element: JQuery;
    timeout: ng.ITimeoutService;
    taskId: string;
    reportError = false;
    refreshIntervalId: number;
    refreshIntervalTime: number;
    properties = {
        template: " ",
        useSelection: " ",
        output: " "
    };


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
            if (v === SERState.error) {
                this.reportError = true;
                clearInterval(this.refreshIntervalId);
                this.status = "Error while running - Retry";
                this.state = SERState.ready;
            }
            if (v === SERState.finished)
                clearInterval(this.refreshIntervalId);
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
            }
            catch (error) {
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
        this.properties = {
            template: " ",
            useSelection: " ",
            output: " "
        };
        this.element = element;
        this.timeout = timeout;
        this.refreshIntervalTime = 1000;
    }

    private createReport () {
        let reqestJson = {
            template: this.properties.template,
            output: this.properties.output,
            selectionMode: this.properties.useSelection
        }
        let serCall: string = `SER.Create('${JSON.stringify(reqestJson)}')`;
        this.logger.debug("call fcn createRepor",serCall);

        this.model.app.evaluate(serCall)
            .then((response) => {

                let statusObject: ISERResponseCreate;
                try {
                    statusObject = JSON.parse(response);
                } catch (error) {
                    this.logger.error("error", error);
                }
                

                if(typeof(statusObject) === "undefined" || statusObject.TaskId === "-1") {
                    this.status = "Wrong Task ID - Retry";
                    this.reportError = true;
                    return;
                }

                this.taskId = statusObject.TaskId;

                this.logger.debug("### taskId:", statusObject.TaskId);

                this.status = "Running ...  (click to abort)";
                this.refreshIntervalId = setInterval(() => {
                    this.getStatus(statusObject.TaskId);
                }, this.refreshIntervalTime);
            })
            .catch((error) => {
                this.logger.error("ERROR", error);
        });
    };

    private setProperties (properties): Promise<void> {
        this.logger.debug("setProperties", properties);
        return new Promise((resolve, reject) => {
            try {
                this.properties.template = properties.template;
                this.properties.useSelection = properties.useSelection;
                this.properties.output = properties.output;
                resolve();
            } catch (error) {
                reject(error);
            }
        });
    };

    private getStatus (taskId: string) {
        let reqestJson: ISERRequestStatus = {
            "TaskId": `${taskId}`
        }
        let serCall: string = `SER.Status('${JSON.stringify(reqestJson)}')`;

        this.logger.debug("call fcn getStatus", serCall);
        this.model.app.evaluate(serCall)
            .then((response) => {
                this.logger.debug("response from status call", response);
                let statusObject: ISERResponseStatus = JSON.parse(response);

                switch (statusObject.Status) {
                    case -1:
                        this.logger.error("Error log from SER: ", statusObject.Log)
                        this.state = SERState.error;
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
                    case 5:
                        this.status = "Download Report";
                        this.link = statusObject.Link;
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
    };

    private abortReport() {
        let reqestJson: ISERRequestStatus = {
            "TaskId": `${this.taskId}`
        }
        let serCall: string = `SER.Abort('${JSON.stringify(reqestJson)}')`;

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

    /**
     * controller function for click actions
     */
    action () {
        this.reportError = false;
        this.status = "Running ... (click to abort)"
        switch (this.state) {
            case SERState.ready:
                this.createReport();
                break;
            case SERState.loading:
                this.abortReport();
                break;
            case SERState.finished:
                this.link = null;
                this.status = "Generate Report"
                this.state = SERState.ready;
                break;
            default:
                break;
        }
    };

    /**
     * isEditMode
     */
    public isEditMode(): boolean {
        if (this.editMode) {
            return true;
        }
        return false;
    }

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