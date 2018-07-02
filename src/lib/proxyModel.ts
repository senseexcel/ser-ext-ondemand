import { logging } from "../node_modules/davinci.js/dist/umd/daVinci";

export class ProxyModel {

    model: EngineAPI.IGenericObject;
    app: EngineAPI.IApp;

    //#region logger
    private _logger: logging.Logger;
    private get logger(): logging.Logger {
        if (!this._logger) {
            try {
                this._logger = new logging.Logger("ProxyModel");
            } catch (error) {
                console.error("ERROR in create logger instance", error);
            }
        }
        return this._logger;
    }
    //#endregion

    //#region properties
    private _properties : EngineAPI.IGenericObjectProperties;
    public get properties() : EngineAPI.IGenericObjectProperties {
        return this._properties;
    }
    public set properties(v : EngineAPI.IGenericObjectProperties) {
        if (JSON.stringify(this._properties) !== JSON.stringify(v)) {
            this._properties = v;




            this.model.emit("changed");
        }
    }
    //#endregion

    constructor(objectReference: string | EngineAPI.IGenericObjectProperties, app: EngineAPI.IApp) {
        this.app = app;
        this.extractProperties(objectReference)
        .then((properties) => {
            return this.app.createSessionObject(properties);
        })
        .then((object) => {
            this.model = object;
        })
        .catch((error) => {
            this.logger.error("ERROR in constructor of ProxyModel", error);
        });
    }

    private extractProperties(objectReference: string | EngineAPI.IGenericObjectProperties): Promise<EngineAPI.IGenericObjectProperties> {
        return new Promise((resolve, reject) => {
            if (typeof(objectReference) === "string") {
                this.app.getObject(objectReference)
                .then((object) => {
                    return object.getProperties();
                })
                .then((properties) => {
                    var newProperties = JSON.parse(JSON.stringify(properties));
                    newProperties.qInfo = {
                        qType: properties.qType
                    };
                    resolve(newProperties);
                })
                .catch((error) => {
                    reject(error);
                });
            } else {
                resolve(objectReference);
            }
        });
    }

}
