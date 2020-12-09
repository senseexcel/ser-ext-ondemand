//#region imports
import "css!./ser-ext-ondemandDirective.css";
import * as template from "text!./ser-ext-ondemandDirective.html";
import { utils, directives } from "./node_modules/davinci.js/dist/umd/daVinci";
import { ISerGeneral, ISerConnection, SelectionType, ISerTemplate, ISerSenseSelection } from "./node_modules/ser.api/index";
import { IProperties, ISERRequestStart, ISerReportExtended, ISERResponseStart, ISERResponseStatus, ISERRequestStatus, ILibrary, IDistribute, IDistributeNew, IConnectorResponse } from "./lib/interfaces";
import { ESERState, EVersionOption, ESerResponseStatusSmaler5, ESerResponseStatus } from "./lib/enums";
import { AppObject } from "./lib/app";
import { Logger } from "./lib/logger/index";
//#endregion

class OnDemandController implements ng.IController {

    //#region variables
    editMode: boolean;
    inactive: boolean = false;
    running: boolean = false;
    hasError: boolean = false;
    clickable: boolean = true;
    title: string = "Generate Report";
    logger: Logger;

    private distribute: any;
    private app: AppObject;
    private host: string;
    private interval: number;
    private intervalShort = 3000;
    private intervalLong = 6000;
    private links: string[];
    private noPropertiesSet = false;
    private properties: IProperties = {
        maxReportRuntime: 900,
        template: " ",
        output: " ",
        selection: 1,
        directDownload: false
    };
    private username: string;
    private tempContentLibIndex: number;
    private taskId: string;
    private timeoutAfterStop = 2000;
    private reportDownloaded = false;
    private timeoutResponseRevieved = true;
    private timeoutResponseCounter = 0;
    private readyStateCounter = 0;
    private version: number;
    private versionGreaterEqual5 = true;
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
            this.logger.trace("new STATE: ", ESERState[v]);
            this.logger.trace("old STATE private: ", ESERState[this._state]);
            this.logger.trace("old STATE public: ", ESERState[this.state]);

            if (this._state === ESERState.starting && (v === ESERState.ready || v === ESERState.finished) && this.readyStateCounter < 5) {
                this.logger.debug("in old state status will be fall back to starting");
                this.readyStateCounter++;
                return;
            }

            if (this.noPropertiesSet && v != ESERState.errorInsufficentRights) {
                v = ESERState.noProperties;
            }

            if (this.reportDownloaded && v === ESERState.finished) {
                v = ESERState.ready;
            }

            if (this.versionGreaterEqual5) {
                if (this.state === ESERState.error && v !== ESERState.serNotRunning && v !== ESERState.ready && v !== ESERState.running && v !== ESERState.starting) {
                    v = ESERState.error;
                }
            } else {
                if (this.state === ESERState.error && v !== ESERState.ready && v !== ESERState.running && v !== ESERState.starting) {
                    v = ESERState.error;
                }
            }

            this.logger.debug("set STATE: ", ESERState[v]);
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
                    this.readyStateCounter = 0;
                    this.interactOptions(false, true, false);
                    this.title = "Running ... (click to abort)";
                    break;

                case ESERState.finished:
                    this.interactOptions(false, false, false);

                    try {
                        let distributeObject: IDistribute | IDistributeNew[] = JSON.parse(this.distribute);
                        this.links = [];

                        // Fallback for < 4.8.1
                        if(typeof((distributeObject as IDistribute).hubResults) !== "undefined") {
                            for (const hubResult of (distributeObject as IDistribute).hubResults) {
                                if (!hubResult.link) {
                                    throw "Empty Downloadlink, please check SecRules";
                                }
                                if (hubResult.success) {
                                    this.links.push(`${this.host}${hubResult.link}`)
                                }
                            }
                        }
                        // end Fallback

                        if (typeof(distributeObject[0]) !== "undefined") {
                            for (const object of (distributeObject as IDistributeNew[])) {
                                if (!object.link) {
                                    throw "Empty Downloadlink, please check SecRules";
                                }
                                if (object.success) {
                                    this.links.push(`${this.host}${object.link}`)
                                }
                            }
                        }

                    } catch (error) {
                        this.logger.error("error in setter of state: ", error);
                        this.state = ESERState.error;
                        break;
                    }
                    this.taskId = undefined;
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

                case ESERState.errorInsufficentRights:
                    this.interactOptions(true, false, true);
                    this.title = "insufficient rights check console"
                    break;

                default:
                    this.interactOptions(false, false, false);
                    this.taskId = undefined;
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
                        this.username = res;
                        this.logger.info(this.username);
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

    private async modelChanged(model: EngineAPI.IGenericObject): Promise<void> {
        this.logger.debug("CHANGE REGISTRATED", "");

        try {
            const objectProperties = await model.getProperties()
            const properties: IProperties = objectProperties.properties

            if (typeof(properties) !== "undefined" && typeof(properties.loglevel) !== "undefined") {
                this.logger.setLogLvl(properties.loglevel)
            }
            await this.extractObjectProperties(properties)

            if ((typeof (this.tempContentLibIndex) !== "undefined"
            && this.tempContentLibIndex !== properties.templateContentLibrary)
            || !this.checkIfTemplateExistsAsContent(properties.template)) {
                properties.template = null;
            }
            this.tempContentLibIndex = properties.templateContentLibrary;

            if (properties.template === null) {
                this.noPropertiesSet = true;
                this.state = ESERState.noProperties;
            } else {
                this.noPropertiesSet = false;
                this.getStatus(this.taskId);
            }
        } catch (error) {
            this.logger.error("ERROR in fcn modelChanged() ", error);
        }
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

        if (this.versionGreaterEqual5) {
            await this.getStatus(this.taskId);
        } else {
            
            if (this.timeoutResponseRevieved || this.timeoutResponseCounter > 10) {
                this.timeoutResponseRevieved = false;
                await this.getStatus(this.taskId);
            }
        }

    }

    private clearInterval(): void {
        this.logger.debug("fcn: clearInterval");
        clearInterval(this.interval);
    }

    private async createStartRequest(): Promise<ISERRequestStart> {
        this.logger.debug("fcn: createRequest");
        let general: ISerGeneral = {
            timeout: this.properties.maxReportRuntime
        };
        let connection: ISerConnection;
        let template: ISerTemplate = {
            input: this.properties.template,
            output: `OnDemand-${this.app.appName}`,
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
                const selections = await this.createSelection();
                connection = {
                    app: this.app.appId
                };
                template = {
                    input: this.properties.template,
                    output: `OnDemand-${this.app.appName}`,
                    outputFormat: this.properties.output,
                    selections: selections
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

    private async createSelection(): Promise<ISerSenseSelection[]> {
        this.logger.debug("in createSelection")

        const props = {
            qInfo: {
                qType: "CurrentSelection"
            },
            qSelectionObjectDef: {}
        };

        let qlikSelectionsObject: EngineAPI.ISelectionListObject;
        let qlikSelectionsObjectLayout: EngineAPI.IGenericSelectionListLayout;

        try {
            qlikSelectionsObject = await this.model.app.createSessionObject(props) as EngineAPI.ISelectionListObject
            qlikSelectionsObjectLayout = await qlikSelectionsObject.getLayout();


            let serSelections: ISerSenseSelection[] = [];


            for (const selection of qlikSelectionsObjectLayout.qSelectionObject.qSelections) {

                let field = selection.qField;

                let notSelectedLength = selection.qNotSelectedFieldSelectionInfo.length;
                let selectedLength = selection.qSelectedFieldSelectionInfo.length;
                let selectionThreshold = selection.qSelectionThreshold;
                let textSearchActive = typeof(selection.qTextSearch) !== "undefined";

                this.logger.debug("field for selection creation",field);

                if (textSearchActive) {
                    this.logger.debug("in text search");

                    let serTextSearchSelection = this.createSerSelectionOverTextSearch(field, selection.qTextSearch);
                    serSelections.push(serTextSearchSelection);

                } else if (selectedLength > 0 && selectedLength < selectionThreshold) {
                    this.logger.debug("in selection object");

                    let serSelectionObjectSelection = this.createSerSelectionSelectionObject(field, selection.qSelectedFieldSelectionInfo)
                    serSelections.push(serSelectionObjectSelection);


                } else if (notSelectedLength > 0 && notSelectedLength < selectionThreshold) {
                    this.logger.debug("in selection object nit");
                    
                    let serSelectionObjectNotSelection = this.createSerSelectionNotSelected(field, selection.qNotSelectedFieldSelectionInfo)
                    serSelections.push(serSelectionObjectNotSelection);
                
                } else if (selection.qSelectedCount > selection.qTotal - selection.qSelectedCount) {
                    this.logger.debug("in listcube not search");

                    let serSelectionHypercubeSelection = await this.createSerSelectionList(field, selection.qTotal - selection.qSelectedCount, true)
                    serSelections.push(serSelectionHypercubeSelection);

                } else {
                    this.logger.debug("in listcube search");

                    let serSelectionHypercubeSelection = await this.createSerSelectionList(field, selection.qSelectedCount)
                    serSelections.push(serSelectionHypercubeSelection);
                }
            }

            this.logger.debug("serSelections", serSelections);

            return serSelections;

        } catch (error) {
            this.logger.error("create selection object failed")
            return []
        }
    }

    private createSerSelectionSelectionObject(field: string, selections: {qName: string, qFieldSelectionMode: string}[]): ISerSenseSelection {
            let serSelection: ISerSenseSelection = {
                objectType: "Field",
                type: SelectionType.Static,
                name: field.replace(/'/g, "''"),
                values: []
            };
            for (const value of selections) {
                serSelection.values.push(`*${value.qName}`);
            }
            return serSelection;
    }

    private createSerSelectionOverTextSearch(field: string, textSearch: string): ISerSenseSelection {
        let serSelection: ISerSenseSelection = {
            objectType: "Field",
            type: SelectionType.Static,
            name: field.replace(/'/g, "''"),
            values: [textSearch]
        };
        return serSelection;
    }

    private async createSerSelectionList(field: string, height: number, negation = false): Promise<ISerSenseSelection> {
        if (height > 3000) {
            this.logger.warn("Height of seected or deselected to large");
            height = 3000
        }
        let fcnTesterName = field.substr(0,1)==="="?true:false;
        const parameter: EngineAPI.IGenericObjectProperties = {
            qInfo: {
                qType: "ListObject"
            },
            qListObjectDef: {
                qDef: {
                    qStateName: "$",
                    qFieldDefs: [
                        field
                    ],
                    qFieldLabels: [
                      field
                    ],
                    qSortCriterias: [
                        {
                            qSortByState: 1
                        }
                    ],
                    qReverseSort: negation
                },
                qInitialDataFetch : [
                    {
                        qWidth : 1,
                        qHeight : height,
                        qTop: 0,
                        qLeft: 0,
                    }
                ]
            }
        };

        let serSelection: ISerSenseSelection = {
            objectType: "Field",
            type: SelectionType.Static,
            name: field.replace(/'/g, "''"),
            values: []
        };

        const assistObject = await this.model.app.createSessionObject(parameter);
        const assistLayout: EngineAPI.IGenericListLayout = await assistObject.getLayout() as EngineAPI.IGenericListLayout;

        let selectionString = "=";
        let counter = 0;
        let assistField = field.replace(/'/g, "''").replace("=", "")

        if (negation) {
            assistLayout.qListObject.qDataPages[0].qMatrix.forEach((row) => {
                if (counter > 0) {
                    selectionString += " and ";
                }
                selectionString += `${fcnTesterName?"":"["}${assistField}${fcnTesterName?"":"]"}<>''${row[0].qText}''`;
                counter++;
            })
        } else {
            assistLayout.qListObject.qDataPages[0].qMatrix.forEach((row) => {
                if (counter > 0) {
                    selectionString += " or ";
                }
                selectionString += `${fcnTesterName?"":"["}${assistField}${fcnTesterName?"":"]"}=''${row[0].qText}''`;
                counter++;
            })
        }

        serSelection.values.push(selectionString);
        return serSelection;

    }

    private createSerSelectionNotSelected(field: string, selections: {qName: string, qFieldSelectionMode: string}[]): ISerSenseSelection {

        let fcnTesterName = field.substr(0,1)==="="?true:false;
        let serSelection: ISerSenseSelection = {
            objectType: "Field",
            type: SelectionType.Static,
            name: field.replace(/'/g, "''"),
            values: []
        };
        let selectionString = "=";
        let assistCounter = 0;
        let assistField = field.replace(/'/g, "''").replace("=", "")
        for (const value of selections) {
            if (assistCounter > 0) {
                selectionString += " and ";
            }
            selectionString += `${fcnTesterName?"":"["}${assistField}${fcnTesterName?"":"]"}<>''${value.qName}''`;
            assistCounter++;
        }
        serSelection.values.push(selectionString);
        return serSelection;
    }

    private start(): void {
        this.logger.debug("fcn: start");
        this.state = ESERState.starting;

        this.runSerStartCommand()
            .catch((error) => {
                this.logger.error("ERROR in createReport", error);
                this.state = ESERState.error;
            });
    }

    private async runSerStartCommand(): Promise<void> {
        this.logger.debug("fcn: runSerStrartCommand");
        return new Promise(async (resolve, reject) => {

            if (this.versionGreaterEqual5) {
                let requestJson: ISERRequestStart = await this.createStartRequest();
                let serCall: string = `SER.Start('${JSON.stringify(requestJson)}')`;
                this.logger.debug("Json for SER.start command: ", serCall);
                let response = await this.model.app.evaluate(serCall);
                let statusObject: IConnectorResponse;
                this.logger.debug("Response from SER.Start: ", response);
                try {
                    statusObject = JSON.parse(response);
                } catch (error) {
                    this.logger.error("error", error);
                    return;
                }
                this.logger.debug("taskId:", statusObject.taskId);
                this.logger.debug("Status:", statusObject.status);

                if (statusObject.taskId === undefined && statusObject.log !== undefined) {
                    this.logger.warn("Task Id undefined, log:", statusObject.log);
                }

                if (statusObject.status === -1) {
                    this.state = ESERState.error;
                }

                this.logger.debug("set Task ID");
                this.taskId = statusObject.taskId;
                this.state = ESERState.starting;

                this.clearInterval();
                this.setStatusInterval(this.intervalShort);

            } else {

                let requestJson: ISERRequestStart = await this.createStartRequest();
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
                        this.logger.error("ERROR", error);
                        reject(error);
                    });
            }
        });
    }

    private extractObjectProperties(properties: IProperties): Promise<void> {
        this.logger.debug("fcn: extractProperties");
        return new Promise((resolve, reject) => {

            let timeout: number;
            try {
                timeout = (properties.maxReportRuntime<1 ? 15 : properties.maxReportRuntime) * 60;
                timeout = isNaN(timeout) ? 900 : timeout;
                this.logger.debug("Max report runtime is set to: ", timeout);
            } catch (error) {
                this.logger.warn("timeout could not be calculated from input")
                timeout = 900;
            }

            try {
                this.properties.template = properties.template;
                this.properties.selection = properties.selection;
                this.properties.output = properties.output;
                this.properties.directDownload = properties.directDownload;
                this.properties.maxReportRuntime = timeout;
                resolve();
            } catch (error) {
                this.logger.error("ERROR", error);
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
            this.logger.error("Error log from SER: ", error);
            this.state = ESERState.error;
            return null;
        }

        return statusObject
    }

    private mapSerStatusAndSetStatus(status: ESerResponseStatusSmaler5 | ESerResponseStatus) {

        // TODO make nice nameing of serVersion ???
        if (this.versionGreaterEqual5) {
            switch (status as ESerResponseStatus) {
                case ESerResponseStatus.serError:
                    this.state = ESERState.error;
                    break;
                case ESerResponseStatus.serVersion:
                        this.state = ESERState.ready;
                        break;
                case ESerResponseStatus.serCreatingReport:
                    this.state = ESERState.starting;
                    break;
                case ESerResponseStatus.serRunning:
                    this.state = ESERState.running;
                    this.reportDownloaded = false;
                    break;
                case ESerResponseStatus.serDeleveryReport:
                    this.state = ESERState.running;
                    break;
                case ESerResponseStatus.serFinished:
                    this.state = ESERState.finished;
                    break;
    
                case ESerResponseStatus.serStopping:
                    this.taskId = undefined;
                    this.state = ESERState.ready;
                    break;

                case ESerResponseStatus.serWarning:
                    this.state = ESERState.finished;
                    break;
    
                default:
                    this.state = ESERState.error;
                    break;
            }
            
        } else {
            switch (status as ESerResponseStatusSmaler5) {
                case ESerResponseStatusSmaler5.serConnectionQlikError:
                    this.state = ESERState.serNoConnectionQlik;
                    break;
                case ESerResponseStatusSmaler5.serError:
                    this.state = ESERState.error;
                    break;
                case ESerResponseStatusSmaler5.serReady:
                    this.state = ESERState.ready;
                    break;
                case ESerResponseStatusSmaler5.serRunning:
                    this.state = ESERState.running;
                    this.reportDownloaded = false;
                    break;
                case ESerResponseStatusSmaler5.serBuildReport:
                    this.state = ESERState.running;
                    break;
                case ESerResponseStatusSmaler5.serFinished:
                    this.state = ESERState.finished;
                    break;
    
                case ESerResponseStatusSmaler5.serStopping:
                    this.state = ESERState.ready;
                    break;
    
                default:
                    this.state = ESERState.error;
                    break;
            }
        }
    }

    private async getStatus(taskId: string) {

        if (this.state === ESERState.error && this.versionGreaterEqual5) {
            return;
        }

        if (this.links !== undefined && this.links.length > 0) {
            this.logger.trace("download link still available");
            return;
        }

        let reqestJson: ISERRequestStatus = {
            "versions": EVersionOption[EVersionOption.all]
        };

        if (taskId !== null && taskId !== undefined) {
            reqestJson = {
                "taskId": `${taskId}`
            };
        }
        let serCall: string = `SER.Status('${JSON.stringify(reqestJson)}')`;
        this.logger.debug("call fcn getStatus", serCall);

        try {
            let response = await this.model.app.evaluate(serCall);
            this.logger.debug("response from status call: ", response);

            // only required for reportin engines smaler 5
            this.timeoutResponseRevieved = true;

            let statusObject = this.evaluateStatusResult(response);
            if (statusObject === null || statusObject === undefined) {
                throw "error";
            }

            if (this.version === null || this.version === undefined) {
                this.version = this.evaluateVersion(statusObject);
                this.versionGreaterEqual5 = this.version >= 5;
                this.logger.debug("Version greater equal 5: ", this.versionGreaterEqual5)
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
            this.logger.error("error occured in get Status", error);
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

    private evaluateVersion(response: IConnectorResponse | ISERResponseStatus): number {
        try {
            return parseInt(response.version.split(".")[0]);
        } catch (error) {
            this.logger.warn("error while evaluation status risponse: ", response.log);
            return 0
        }
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
                logger: "<",
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
