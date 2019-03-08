//#region imports
import "css!./ser-ext-ondemandDirective.css";

import * as template from "text!./ser-ext-ondemandDirective.html";

import { isNull } from "util";

import {
    utils,
    logging,
    directives
} from "./node_modules/davinci.js/dist/umd/daVinci";
import {
    ISerGeneral,
    ISerConnection,
    SelectionType,
    ISerTemplate
} from "./node_modules/ser.api/index";
import {
    IProperties,
    ISERRequestStart,
    ISerReportExtended,
    ISERResponseStart,
    ISERResponseStatus,
    IGenericBookmarkExtended,
    ISERRequestStatus,
    ILibrary,
    IGenericBookmarkLayoutMetaExtended,
    INxAppPropertiesExtended,
    IDistribute
} from "./lib/interfaces";
import {
    ESERState,
    EVersionOption
} from "./lib/enums";
//#endregion

class OnDemandController implements ng.IController {

    //#region variables
    clicked: boolean = false;
    invalid: boolean = false;
    actionRunable: boolean = false;
    editMode: boolean;
    running: boolean = false;
    title: string = "Generate Report";

    private appId: string;
    private appPublished: boolean;
    private bookmarkName: string = "serBookmarkOnDemand";
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
    private sheetId: string;
    private tempContentLibIndex: number;
    private taskId: string;
    private timeoutAfterStop: number = 2000;
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

            this._state = v;

            switch (v) {
                case ESERState.ready:
                    this.running = false;
                    this.clicked = false;
                    this.actionRunable = true;
                    setTimeout(() => {
                        this.links = [];
                    }, 1000);
                    this.title = "Generate Report";
                    break;

                case ESERState.running:
                    this.running = true;
                    this.actionRunable = true;
                    this.title = "Running ... (click to abort)";
                    break;

                case ESERState.finished:

                    this.running = false;
                    this.clicked = false;
                    this.actionRunable = true;

                    this.title = "Download Report";
                    if (this.properties.directDownload) {
                        this.action();
                    }

                    this.clearInterval();
                    this.setInterval(this.intervalLong);
                    break;

                case ESERState.serNotRunning:
                    this.running = false;
                    this.clicked = false;
                    this.actionRunable = false;
                    this.title = "SER not available";
                    break;

                case ESERState.serNoConnectionQlik:
                    this.running = false;
                    this.clicked = false;
                    this.actionRunable = false;
                    this.title = "SER no connection to Qlik";
                    break;

                case ESERState.noProperties:
                    this.running = false;
                    this.clicked = false;
                    this.actionRunable = false;
                    this.title = "No Properties selected";
                    break;

                default:
                    this.running = false;
                    this.clicked = false;
                    this.actionRunable = true;
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

                let hostArr: Array<string> = ((this.model as any).session.rpc.url as string).split("/");
                this.host = `${hostArr[0] === "wss:" ? "https" : "http"}://${hostArr[2]}${hostArr[3] !== "app" ? "/" + hostArr[3] : ""}`;

                let arrProm: Promise<void>[] = [];
                arrProm.push(this.getUsername());
                arrProm.push(this.getIsPublished());

                this.getSheetId()
                    .catch((error) => {
                        this.logger.info("no sheet found");
                        throw error;
                    });

                Promise.all(arrProm)
                    .then(() => {
                        this.invalid = true;
                        this.logger.info(this.username);
                    })
                    .catch((error) => {
                        this.logger.error("error in constructor", error);
                    });

                this.getStatus(this.taskId);
                this.setInterval(this.intervalLong);

                this.model.app.getAppLayout()
                    .then((res) => {
                        this.appId = res.qFileName;
                    })
                    .catch((error) => {
                        this.logger.error("ERROR", error);
                    });

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

    $onInit(): void {
        this.logger.debug("initialisation from BookmarkController");
    }

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

    static $inject = ["$timeout", "$scope"];

    /**
     * init of the controller for the Directive
     */
    constructor() {
        // empty constructor
    }

    //#region private function
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
                    this.state = ESERState.ready;
                }
                this.extractProperties(res.properties)
                    .catch((error) => {
                        this.logger.error("error", error);
                    });
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

    private getUsername(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.model.app.evaluateEx("=OSUser()")
                .then((res) => {
                    let uArr = res.qText.split(";");
                    this.username = `${uArr[0].split("=")[1]}/${uArr[1].split("=")[1]}`;
                    this.bookmarkName = `serBookmarkOnDemand-${this.username}`;
                    resolve();
                })
                .catch((error) => {
                    this.logger.error("error while getting user", error);
                    this.bookmarkName = "serBookmarkOnDemand";
                    reject();
                });
        });
    }

    private getSheetId(): Promise<void> {
        return new Promise((resolve, reject) => {

            this.model.app.getAllInfos()
                .then((allInfo) => {
                    let sheets: EngineAPI.INxInfo[] = [];
                    for (const info of allInfo) {
                        if (info.qType === "sheet") {
                            sheets.push(info);
                        }
                    }
                    for (const sheet of sheets) {
                        let sheetObject: EngineAPI.IGenericObject;
                        this.model.app.getObject(sheet.qId)
                            .then((res) => {
                                sheetObject = res;
                                return res.getFullPropertyTree();
                            })
                            .then((res) => {
                                for (const iterator of res.qChildren) {
                                    if (iterator.qProperty.qInfo.qId === this.model.id) {
                                        this.sheetId = sheetObject.id;
                                    }
                                }
                                resolve();
                            })
                            .catch((error) => {
                                Promise.reject(error);
                            });
                    }
                })
                .catch((error) => {
                    this.logger.error("error in get sheet id", error);
                    this.sheetId = "default";
                    reject();
                });
        });
    }

    private getIsPublished(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.model.app.getAppProperties()
                .then((appProperties: INxAppPropertiesExtended) => {
                    this.appPublished = false;
                    if (typeof (appProperties.published) !== "undefined") {
                        this.appPublished = appProperties.published;
                    }
                    resolve();
                })
                .catch((error) => {
                    this.logger.error("error in if sheet is published", error);
                    reject();
                });
        });
    }

    private setInterval(intervalTime: number): void {
        this.logger.debug("fcn: setInterfal");
        if (typeof (intervalTime) === "undefined") {
            intervalTime = 5000;
        }
        this.interval = window.setInterval(() => {
            this.getStatus(this.taskId);
        }, intervalTime);
    }

    private clearInterval(): void {
        this.logger.debug("fcn: clearInterval");
        clearInterval(this.interval);
    }

    private createRequest(bookmarkId: string): ISERRequestStart {
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
                    app: this.appId,
                    identities: [""]
                };
                break;

            case 1:
                connection = {
                    app: this.appId
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
                    app: this.appId
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
                    mode: "Override"
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
        if (this.properties.selection !== 1) {
            this.runSerStartCommand("")
                .catch((error) => {
                    this.logger.error("ERROR in createReport", error);
                });
        } else {
            this.createBookmark()
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

            let requestJson: ISERRequestStart = this.createRequest(bookmarkId);
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
                    this.setInterval(this.intervalShort);
                    resolve();
                })
                .catch((error) => {
                    reject(error);
                });
        });
    }

    private createBookmark(): Promise<string> {
        this.logger.debug("fcn: createBookmark");
        return new Promise((resolve, reject) => {

            let bookmarkId: string = "";
            let bookmarkProperties: EngineAPI.IGenericBookmarkProperties = {
                qInfo: {
                    qType: "hiddenbookmark"
                },
                qMetaDef: {
                    title: this.bookmarkName,
                    approved: false
                },
                sheetId: this.sheetId,
                creationDate: (new Date()).toISOString()
            };

            this.model.app.getBookmarks({
                qTypes: ["hiddenbookmark"],
                qData: {}
            })
                .then((bookmarks) => {
                    let proms: Promise<void>[] = [];
                    let bookmarksTyped: EngineAPI.INxContainerEntry<any>[] = bookmarks as any;
                    for (const bookmark of bookmarksTyped) {
                        try {
                            let meta: IGenericBookmarkLayoutMetaExtended = bookmark.qMeta as IGenericBookmarkLayoutMetaExtended;
                            if (meta.title === this.bookmarkName) {
                                proms.push(this.destroyExistingBookmark(bookmark.qInfo.qId));
                            }
                        } catch {
                            // if the bookmark is not correct, just do nothing
                        }
                    }
                    return Promise.all(proms);
                })
                .then(() => {
                    this.logger.debug("bookmark properties", bookmarkProperties);
                    return this.model.app.createBookmark(bookmarkProperties);
                })
                .then((bookmarkObject: IGenericBookmarkExtended) => {
                    bookmarkId = bookmarkObject.id;

                    switch (this.appPublished) {
                        case true:
                            this.logger.debug("app is published");
                            return bookmarkObject.publish();

                        default:
                            this.logger.debug("app is in my work");
                            return this.model.app.doSave();
                    }
                })
                .then(() => {
                    resolve(bookmarkId);
                })
                .catch((error) => {
                    this.logger.error("ERROR in create Bookmark", error);
                    reject(error);
                });
        });
    }

    private destroyExistingBookmark(id: string): Promise<void> {
        this.logger.debug("fcn: destroyExistingBookmark", id);
        return new Promise((resolve, reject) => {
            let obj: EngineAPI.IGenericBookmark;
            this.model.app.getBookmark(id)
                .then((object) => {
                    obj = object;
                    this.logger.debug("fcn: destroyExistingBookmark - bevor getLayout");

                    return obj.getLayout();
                })
                .then((layout) => {
                    this.logger.debug("fcn: destroyExistingBookmark - layout bookmark", layout);
                    try {
                        let meta: IGenericBookmarkLayoutMetaExtended = layout.qMeta as IGenericBookmarkLayoutMetaExtended;
                        if (typeof (meta.published) !== "undefined"
                            && typeof (meta.privileges) !== "undefined"
                            && meta.privileges.indexOf("publish") !== -1
                            && !meta.approved) {
                            this.logger.debug("fcn: destroyExistingBookmark - bevor unpublish", layout);
                            return obj.unPublish();
                        }
                    } catch (error) {
                        reject(error);
                    }
                })
                .then(() => {
                    return obj.getLayout();
                })
                .then((layout) => {
                    try {
                        let meta: IGenericBookmarkLayoutMetaExtended = layout.qMeta as IGenericBookmarkLayoutMetaExtended;
                        if (typeof (meta.privileges) !== "undefined"
                            && meta.privileges.indexOf("delete") !== -1) {
                            this.logger.debug("fcn: destroyExistingBookmark - bevor destroyBookmark");
                            return this.model.app.destroyBookmark(id);
                        }
                    } catch (error) {
                        reject(error);
                    }
                })
                .then((res) => {
                    this.logger.info("Status from delete", res);
                    resolve();
                })
                .catch((error) => {
                    this.logger.error("ERROR in destroyExistingBookmark", error);
                    reject(error);
                });
        });
    }

    private extractProperties(properties: IProperties): Promise<void> {
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

    private getStatus(taskId: string) {
        this.logger.debug("fcn: getStatus");
        let reqestJson: ISERRequestStatus = {};
        if (typeof (taskId) !== "undefined") {
            reqestJson = {
                "taskId": `${taskId}`
            };
        } else {
            reqestJson = {
                "versions": EVersionOption[EVersionOption.all]
            };
        }

        let serCall: string = `SER.Status('${JSON.stringify(reqestJson)}')`;
        this.logger.debug("call fcn getStatus", serCall);

        this.model.app.evaluate(serCall)
            .then((response) => {
                let statusObject: ISERResponseStatus;
                this.logger.debug("response from status call", response);

                try {
                    if (response.indexOf("Error in expression") !== -1) {
                        this.logger.warn(response);
                        this.state = ESERState.serNotRunning;
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
                    this.state = ESERState.error;
                }

                if (typeof (statusObject.taskId) !== "undefined") {
                    this.taskId = statusObject.taskId;
                }

                this.logger.debug("statusObject.Status", statusObject.status);

                switch (statusObject.status) {
                    case -2:
                        this.state = ESERState.serNoConnectionQlik;
                        break;
                    case -1:
                        this.state = ESERState.error;
                        break;
                    case 0:
                        this.state = ESERState.ready;
                        this.logger.info("SER Status is ready");
                        break;
                    case 1:
                        this.state = ESERState.running;
                        break;
                    case 2:
                        this.state = ESERState.running;
                        break;
                    case 3:

                        let distributeObject: IDistribute = JSON.parse(statusObject.distribute);

                        this.links = [];
                        for (const hubResult of distributeObject.hubResults) {
                            if (hubResult.success) {
                                this.links.push(`${this.host}${hubResult.link}`)
                            }
                        }
                        this.state = ESERState.finished;
                        break;

                    default:
                        this.state = ESERState.error;
                        break;
                }
            })
            .catch((error) => {
                this.state = ESERState.serNotRunning;
                this.logger.error("ERROR", error);
            });
    }

    private stopReport() {
        this.logger.debug("fcn: stopReport");
        let reqestJson: ISERRequestStatus = {
            "taskId": `${this.taskId}`
        };

        let serCall: string = `SER.Stop('${JSON.stringify(reqestJson)}')`;

        this.logger.debug("call fcn abortReport", serCall);
        this.model.app.evaluate(serCall)
            .then(() => {
                this.logger.debug("report generation aborted");
            })
            .catch((error) => {
                this.logger.error("ERROR in abortRepot", error);
                this.state = ESERState.error;
            });
    }
    //#endregion

    //#region public functions

    /**
     * controller function for click actions
     */
    public action() {
        this.logger.debug("fcn: action");
        if (this.state === 4) {
            return;
        }
        switch (this.state) {
            case ESERState.ready:
                this.clicked = true;
                this.running = true;
                this.title = "Running ... (click to abort)";
                this.start();
                break;
            case ESERState.running:
                this.title = "Aborting ... ";
                this.stopReport();
                break;
            case ESERState.finished:
                this.title = "Generate Report";
                this.state = ESERState.ready;
                for (const link of this.links) {
                    if (link.length > 0) {
                        window.open(link, "_blank");
                    } else {
                        this.title = "no Link found - retry generation";
                    }
                }
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
        this.logger.trace("fcn: isEditMode");
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
                    directives.IdentifierDirectiveFactory(rootNameSpace), "Identifier");
                utils.checkDirectiveIsRegistrated($injector, $registrationProvider, rootNameSpace,
                    directives.ShortCutDirectiveFactory(rootNameSpace), "Shortcut");
            }
        };
    };
}
