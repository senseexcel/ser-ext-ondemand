//#region imports
import { utils, logging, directives } from "../node_modules/davinci.js/dist/umd/daVinci";
import * as template from "text!./ser-ext-ondemandDirective.html";
import "css!./main.css";
//#endregion

class OnDemandController implements ng.IController {

    taskId: string;
    status: string = "Generate Report";
    link: string;
    state: string = "load";
    element: JQuery;
    timeout: ng.ITimeoutService;
    reportError = false;
    refreshIntervalId: number;
    properties = {
        template: " ",
        useSelection: " ",
        output: " "
    };

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
                (value as any).on("changed", function () {
                    value.getProperties()
                        .then((res) => {
                        that.setProperties(res.properties);
                    })
                        .catch( (error) => {
                        console.error("ERROR in setter of model ", error);
                    });
                });
                (value as any).emit("changed");
            }
            catch (e) {
                console.error("error", e);
            }
        }
    }
    //#endregion

    $onInit(): void {
        // this.logger.debug("initialisation from BookmarkController");
    }

    static $inject = ["$timeout", "$element", "$scope"];

    /**
     * init of the controller for the Directive
     * @param timeout
     * @param element
     */
    constructor(timeout: ng.ITimeoutService, element: JQuery, scope: ng.IScope) {
        this.status = "Generate Report";
            this.state = "load";
            this.properties = {
                template: " ",
                useSelection: " ",
                output: " "
            };
            this.element = element;
            this.timeout = timeout;
    }

    getStatus () {
        console.log("### call fcn getStatus ###"),
        console.log("callFcn", "SER.Status('" + this.taskId + "')");
        this.model.app.evaluate("SER.Status('" + this.taskId + "')")
            .then((status) => {
            console.log("status", status);
            switch (status) {
                case "-1":
                    clearInterval(this.refreshIntervalId);
                    this.status = "Error, confirm Logs";
                    this.state = "finished";
                    this.reportError = true;
                    break;
                case "0":
                    this.status = "Starting ...";
                    break;
                case "1":
                    this.status = "Running ...";
                    this.state = "load";
                    break;
                case "100":
                    clearInterval(this.refreshIntervalId);
                    this.status = "Download Report";
                    this.state = "finished";
                    break;
                default:
                    clearInterval(this.refreshIntervalId);
                    this.status = "Error, confirm Logs";
                    this.state = "finished";
                    this.reportError = true;
                    break;
            }
        })
            .catch((error) => {
            console.error("ERROR", error);
        });
    };

    downloadReport () {
        this.model.app.evaluate("SER.Download('" + this.taskId + "')")
            .then((link) => {
            console.log("link", link);
            window.open("" + link);
            this.state = "load";
            this.status = "Generate Report";
        })
            .catch((error) => {
            console.error("error", error);
        });
    };

    createReport () {
        console.log("### call fcn createReport ###"),
        console.log("callFcn", "SER.Create('" + this.properties.template + "','" + this.properties.output + "','" + this.properties.useSelection + "')");
        this.model.app.evaluate("SER.Create('" + this.properties.template + "','" + this.properties.output + "','" + this.properties.useSelection + "')")
            .then((taskId) => {
            console.log("### taskId:", taskId);
            if(taskId === "-1") {
                this.status = "Wrong Task ID";
                this.reportError = true;
                return;
            }
            this.taskId = taskId;
            this.status = "Running ...";
            this.refreshIntervalId = setInterval(() => {
                this.getStatus();
            }, 1000);
        })
            .catch((error) => {
            console.error("ERROR", error);
        });
    };

    setProperties (properties) {
        console.log("setProperties", properties);
            return new Promise((resolve, reject) => {
                this.properties.template = properties.template;
                this.properties.useSelection = properties.useSelection;
                this.properties.output = properties.output;
            });
    };
    
    action () {
        switch (this.state) {
            case "load":
                this.createReport();
                break;
            case "finished":
                this.downloadReport();
                break;
            default:
                break;
        }
    };

    restart() {
        this.reportError = false;
        this.state = "load";
        this.status = "Running ..."
        this.action();
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
                    directives.ListViewDirectiveFactory(rootNameSpace), "Listview");
                utils.checkDirectiveIsRegistrated($injector, $registrationProvider, rootNameSpace,
                    directives.IdentifierDirectiveFactory(rootNameSpace), "Identifier");
                utils.checkDirectiveIsRegistrated($injector, $registrationProvider, rootNameSpace,
                    directives.ShortCutDirectiveFactory(rootNameSpace), "Shortcut");
                utils.checkDirectiveIsRegistrated($injector, $registrationProvider, rootNameSpace,
                    directives.ExtensionHeaderDirectiveFactory(rootNameSpace), "ExtensionHeader");
            }
        };
    };
}