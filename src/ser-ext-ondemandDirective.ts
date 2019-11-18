//#region imports
import "css!./ser-ext-ondemandDirective.css";
import * as template from "text!./ser-ext-ondemandDirective.html";
import { isNull, isNullOrUndefined } from "util";
import { utils, logging, directives } from "./node_modules/davinci.js/dist/umd/daVinci";
import { ISerGeneral, ISerConnection, SelectionType, ISerTemplate } from "./node_modules/ser.api/index";
import { IProperties, ISERRequestStart, ISerReportExtended, ISERResponseStart, ISERResponseStatus, IGenericBookmarkExtended, ISERRequestStatus, ILibrary, IGenericBookmarkLayoutMetaExtended, INxAppPropertiesExtended, IDistribute } from "./lib/interfaces";
import { ESERState, EVersionOption, ESerResponseStatus } from "./lib/enums";
import { AppObject } from "./lib/app";
//#endregion

class OnDemandController implements ng.IController {

    //#region variables
    editMode: boolean;
    inactive: boolean = false;
    running: boolean = false;
    hasError: boolean = false;
    clickable: boolean = true;
    title: string = "Generate Report";

    private distribute: any;
    private app: AppObject;
    private tagName: string = "SER";
    private host: string;
    private interval: number;
    private intervalShort: number = 3000;
    private intervalLong: number = 6000;
    private links: string[];
    private noPropertiesSet: boolean = true;
    private properties: IProperties = {
        template: " ",
        output: " ",
        selection: 0,
        directDownload: false
    };
    private username: string;
    private tempContentLibIndex: number;
    private taskId: string;
    private timeoutAfterStop: number = 2000;
    private reportDownloaded = false;
    private timeoutResponseRevieved = true;
    private timeoutResponseCounter = 0;
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
    private _state: ESERState;
    public get state(): ESERState {
        if (typeof (this._state) !== "undefined") {
            return this._state;
        }
        return ESERState.ready;
    }
    public set state(v: ESERState) {
        if (v !== this._state) {
            this.logger.debug("STATE: ", v);

            if (this.noPropertiesSet) {
                v = ESERState.noProperties;
            }

            if (this.reportDownloaded && v === ESERState.finished) {
                v = ESERState.ready;
            }

            this._state = v;
            switch (v) {

                case ESERState.starting:
                    this.interactOptions(true, true, false);
                    this.title = "Starting";
                    break;

                case ESERState.ready:
                    this.interactOptions(false, false, false);
                    this.title = "Generate Report";
                    break;

                case ESERState.running:
                    this.interactOptions(false, true, false);
                    this.title = "Running ... (click to abort)";
                    break;

                case ESERState.finished:
                    this.interactOptions(false, false, false);

                    try {
                        let distributeObject: IDistribute = JSON.parse(this.distribute);
                        this.links = [];
                        for (const hubResult of distributeObject.hubResults) {
                            if (hubResult.success) {
                                this.links.push(`${this.host}${hubResult.link}`)
                            }
                        }
                    } catch (error) {
                        this.state = ESERState.error;
                    }
                    if (this.properties.directDownload) {
                        this.action();
                    } else {
                        this.title = "Download Report";
                    }
                    break;

                case ESERState.serNotRunning:
                    this.interactOptions(true, false, true);
                    this.title = "SER not available";
                    break;

                case ESERState.serNoConnectionQlik:
                    this.interactOptions(true, false, true);
                    this.title = "SER no connection to Qlik";
                    break;

                case ESERState.noProperties:
                    this.interactOptions(true, false, true);
                    this.title = "No Properties selected";
                    break;

                case ESERState.stopping:
                    this.interactOptions(true, true, false)
                    this.title = "stopping report creation"
                    break;

                case ESERState.errorNoLinkFound:
                    this.interactOptions(false, false, true)
                    this.title = "no Link found - retry generation"
                    break;

                default:
                    this.interactOptions(false, false, false);
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
                this.app = new AppObject(value.app);
                let hostArr: Array<string> = ((this.model as any).session.rpc.url as string).split("/");
                this.host = `${hostArr[0] === "wss:" ? "https" : "http"}://${hostArr[2]}${hostArr[3] !== "app" ? "/" + hostArr[3] : ""}`;

                this.app.getUsername()
                    .then((res) => {
                        this.logger.info(this.username);
                        this.username = res;
                    })
                    .catch((error) => {
                        this.logger.error("error in setter of model", error);
                    });

                this.setStatusInterval(this.intervalLong);

                var that = this;
                this.modelOnChangedFunction = function () {
                    that.modelChanged(this);
                };
                value.on("changed", this.modelOnChangedFunction);
                value.emit("changed");
            } catch (error) {
                this.logger.error("ERROR in setter of model", error);
            }
        }
    }
    //#endregion

    //#region libraryContent
    private _libraryContent: ILibrary[];
    public get libraryContent(): ILibrary[] {
        return this._libraryContent;
    }
    public set libraryContent(v: ILibrary[]) {
        if (v !== this._libraryContent && typeof (v) !== "undefined") {
            this._libraryContent = v;
        }
    }
    //#endregion

    modelOnChangedFunction: () => void = null;

    $onDestroy(): void {
        try {
            this.clearInterval();
            if (typeof (this.modelOnChangedFunction) === "function") {
                (this.model as any).removeListener("changed", this.modelOnChangedFunction);
            }
        } catch {
            this.logger.debug("could not clear interval onDestroy");
        }
    }

    //#region private function

    private interactOptions(inactive: boolean, running: boolean, hasError: boolean): void {
        this.inactive = inactive;
        this.running = running;
        this.hasError = hasError;
    }

    private modelChanged(value: EngineAPI.IGenericObject): void {
        this.logger.debug("CHANGE REGISTRATED", "");

        value.getProperties()
            .then((res) => {
                if ((typeof (this.tempContentLibIndex) !== "undefined"
                    && this.tempContentLibIndex !== res.properties.templateContentLibrary)
                    || !this.checkIfTemplateExistsAsContent(res.properties.template)) {
                    res.properties.template = null;
                }
                this.tempContentLibIndex = res.properties.templateContentLibrary;

                if (isNull(res.properties.template)) {
                    this.noPropertiesSet = true;
                    this.state = ESERState.noProperties;
                } else {
                    this.noPropertiesSet = false;
                    this.getStatus(this.taskId);
                }
                return this.extractObjectProperties(res.properties)
            })
            .catch((error) => {
                this.logger.error("ERROR in setter of model ", error);
            });
    }

    private checkIfTemplateExistsAsContent(template: string): boolean {
        if (typeof (this.libraryContent) === "undefined") {
            return true;
        }
        for (const library of this.libraryContent) {
            for (const item of library.content) {
                if (item.value === template) {
                    return true;
                }
            }
        }
        return false;
    }

    private setStatusInterval(intervalTime: number): void {
        this.logger.debug("fcn: setInterfal");
        if (typeof (intervalTime) === "undefined") {
            intervalTime = 5000;
        }
        this.runStatus();
        this.interval = window.setInterval(async () => {
            this.timeoutResponseCounter++;
            await this.runStatus();
        }, intervalTime);
    }

    private async runStatus() {
        if (this.timeoutResponseRevieved || this.timeoutResponseCounter > 10) {
            this.timeoutResponseRevieved = false;
            await this.getStatus(this.taskId);
        }
    }

    private clearInterval(): void {
        this.logger.debug("fcn: clearInterval");
        clearInterval(this.interval);
    }

    private createStartRequest(bookmarkId: string): ISERRequestStart {
        this.logger.debug("fcn: createRequest");
        let general: ISerGeneral = {};
        let connection: ISerConnection;
        let template: ISerTemplate = {
            input: this.properties.template,
            output: "OnDemand",
            outputFormat: this.properties.output,
            selectionsClearAll: false
        };

        switch (this.properties.selection) {
            case 0:
                connection = {
                    app: this.app.appId,
                    identities: [""]
                };
                break;

            case 1:
                connection = {
                    app: this.app.appId
                };
                template = {
                    input: this.properties.template,
                    output: "OnDemand",
                    outputFormat: this.properties.output,
                    selections: [{
                        type: SelectionType.Static,
                        objectType: "hiddenbookmark",
                        values: [bookmarkId],
                    }]
                };
                break;

            default:
                connection = {
                    app: this.app.appId
                };
                template.selectionsClearAll = true;
                break;
        }

        let report: ISerReportExtended = {
            general: general,
            connections: [connection],
            template: template,
            distribute: {
                hub: {
                    connections: "@CONFIGCONNECTION@",
                    mode: "DeleteAllFirst"
                }
            }
        };

        return {
            tasks: [{
                reports: [report]
            }]
        };
    }

    private start(): void {
        this.logger.debug("fcn: start");
        this.state = ESERState.starting;

        if (this.properties.selection !== 1) {
            this.runSerStartCommand("")
                .catch((error) => {
                    this.logger.error("ERROR in createReport", error);
                });
        } else {
            this.app.createBookmark(this.tagName, this.app.appIsPublic)
                .then((bookmarkId) => {
                    return this.runSerStartCommand(bookmarkId);
                })
                .catch((error) => {
                    this.logger.error("ERROR in createReport", error);
                });
        }
    }

    private runSerStartCommand(bookmarkId: string): Promise<void> {
        this.logger.debug("fcn: runSerStrartCommand");
        return new Promise((resolve, reject) => {

            let requestJson: ISERRequestStart = this.createStartRequest(bookmarkId);
            let serCall: string = `SER.Start('${JSON.stringify(requestJson)}')`;
            this.logger.debug("Json for SER.start command: ", serCall);

            this.model.app.evaluate(serCall)
                .then((response) => {
                    let statusObject: ISERResponseStart;
                    this.logger.debug("Response from SER.Start: ", response);
                    try {
                        statusObject = JSON.parse(response);
                    } catch (error) {
                        this.logger.error("error", error);
                    }
                    this.logger.debug("taskId:", statusObject.taskId);
                    this.logger.debug("Status:", statusObject.status);

                    if (typeof (statusObject) === "undefined" || statusObject.taskId === "-1") {
                        this.logger.debug("in defined error block from SER.Start");
                        this.title = "Wrong Task ID - Retry";
                        return;
                    }

                    if (statusObject.status === -1) {
                        this.state = ESERState.serNoConnectionQlik;
                    }

                    this.logger.debug("set Task ID");
                    this.taskId = statusObject.taskId;
                    this.state = ESERState.running;

                    this.clearInterval();
                    this.setStatusInterval(this.intervalShort);
                    resolve();
                })
                .catch((error) => {
                    reject(error);
                });
        });
    }

    private extractObjectProperties(properties: IProperties): Promise<void> {
        this.logger.debug("fcn: extractProperties");
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

    private evaluateStatusResult(response: string): ISERResponseStatus {
        let statusObject: ISERResponseStatus;

        if (typeof response === "undefined") {
            return null;
        }

        if (response.indexOf("Error in expression") !== -1) {
            this.logger.warn(response);
            this.state = ESERState.serNotRunning;
            return null;
        }

        try {
            statusObject = JSON.parse(response);
        } catch (error) {
            this.logger.error("Error log from SER: ", response);
            this.state = ESERState.error;
            return null;
        }

        return statusObject
    }

    private mapSerStatusAndSetStatus(status: ESerResponseStatus) {

        switch (status) {
            case ESerResponseStatus.serConnectionQlikError:
                this.state = ESERState.serNoConnectionQlik;
                break;
            case ESerResponseStatus.serError:
                this.state = ESERState.error;
                break;
            case ESerResponseStatus.serReady:
                this.state = ESERState.ready;
                break;
            case ESerResponseStatus.serRunning:
                this.state = ESERState.running;
                this.reportDownloaded = false;
                break;
            case ESerResponseStatus.serBuildReport:
                this.state = ESERState.running;
                break;
            case ESerResponseStatus.serFinished:
                this.state = ESERState.finished;
                break;

            case ESerResponseStatus.serStopping:
                this.state = ESERState.ready;
                break;

            default:
                this.state = ESERState.error;
                break;
        }
    }

    private async getStatus(taskId: string) {
        let reqestJson: ISERRequestStatus = {
            "versions": EVersionOption[EVersionOption.all]
        };
        if (typeof (taskId) !== "undefined") {
            reqestJson = {
                "taskId": `${taskId}`
            };
        }
        let serCall: string = `SER.Status('${JSON.stringify(reqestJson)}')`;
        this.logger.debug("call fcn getStatus", serCall);

        try {
            var response = await this.model.app.evaluate(serCall);

            this.logger.debug("response from status call", response);
            this.timeoutResponseRevieved = true;

            let statusObject = this.evaluateStatusResult(response);
            if (isNullOrUndefined(statusObject)) {
                throw "error";
            }

            if (typeof (statusObject.taskId) !== "undefined") {
                this.taskId = statusObject.taskId;
            }

            if (typeof (statusObject.distribute) !== "undefined") {
                this.distribute = statusObject.distribute;
            }

            this.logger.debug("statusObject.Status", statusObject.status);

            this.mapSerStatusAndSetStatus(statusObject.status)
            return;

        } catch (error) {
            this.logger.error(error);
            this.state = ESERState.serNotRunning;
            return;
        }
    }

    private stopReport() {
        this.logger.debug("fcn: stopReport");
        this.state = ESERState.stopping;

        if (typeof this.taskId === "undefined") {
            return;
        }
        let reqestJson: ISERRequestStatus = {
            "taskId": `${this.taskId}`
        };

        let serCall: string = `SER.Stop('${JSON.stringify(reqestJson)}')`;

        this.logger.debug("call fcn abortReport", serCall);
        this.model.app.evaluate(serCall)
            .then((res) => {
                this.logger.debug("report generation aborted");
            })
            .catch((error) => {
                this.logger.error("ERROR in abortRepot", error);
                this.state = ESERState.error;
            });
    }

    private downloadReport() {
        this.state = ESERState.ready;
        if (this.reportDownloaded) {
            return;
        }
        for (const link of this.links) {
            if (link.length > 0) {
                window.open(link, "_blank");
            } else {
                this.state = ESERState.errorNoLinkFound;
            }
        }
        this.reportDownloaded = true;
        this.links = [];
    }

    //#endregion

    //#region public functions

    public action() {
        this.logger.debug("fcn: action");
        if (this.inactive) {
            return;
        }

        switch (this.state) {

            case ESERState.running:
                this.stopReport();
                break;

            case ESERState.finished:
                this.downloadReport()
                setTimeout(() => {
                    this.clearInterval();
                    this.setStatusInterval(this.intervalLong);
                }, this.timeoutAfterStop);
                break;

            default:
                this.start();
                break;
        }
    }

    public isEditMode(): boolean {
        if (this.editMode) {
            return true;
        }
        return false;
    }

    //#endregion
}

export function OnDemandDirectiveFactory(rootNameSpace: string): ng.IDirectiveFactory {
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
                libraryContent: "<",
                editMode: "<?"
            },
            compile: (): void => {
                utils.checkDirectiveIsRegistrated($injector, $registrationProvider, rootNameSpace,
                    directives.ShortCutDirectiveFactory(rootNameSpace), "Shortcut");
            }
        };
    };
}
