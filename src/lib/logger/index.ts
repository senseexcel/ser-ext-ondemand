//#region IMPORTS
import {
    ELoglevel,
    ETransportType,
    EConsoleType
} from "./utils/enums";
import {
    ILogger,
    IClientConfig,
    ITransport,
    IMergedConfig
} from "./utils/interfaces";
import {
    DefaultConsolTransport,
    BaseTransport
} from "./lib/transport";
//#endregion

class Logger implements ILogger {

    private config: IMergedConfig;

    constructor(config?: IClientConfig) {
        this.config = this.setConfig(config);
    }

    //#region public functions
    public trace(...args: any[]): string {
        let output = this.configureOutput(args, ELoglevel.TRACE, this.config.transports[0]);
        this.writeLog(output, ELoglevel.TRACE, EConsoleType.log);
        return output;
    }

    public debug(...args: any[]): string {
        let output = this.configureOutput(args, ELoglevel.DEBUG, this.config.transports[0]);
        this.writeLog(output, ELoglevel.DEBUG, EConsoleType.log);
        return output;
    }

    public info(...args: any[]): string {
        let output = this.configureOutput(args, ELoglevel.INFO, this.config.transports[0]);
        this.writeLog(output, ELoglevel.INFO, EConsoleType.log);
        return output;
    }

    public warn(...args: any[]): string {
        let output = this.configureOutput(args, ELoglevel.WARN, this.config.transports[0]);
        this.writeLog(output, ELoglevel.WARN, EConsoleType.warn);
        return output;
    }

    public error(...args: any[]): string {
        let output = this.configureOutput(args, ELoglevel.ERROR, this.config.transports[0]);
        this.writeLog(output, ELoglevel.ERROR, EConsoleType.error);
        return output;
    }

    public setLogLvl(loglevel: ELoglevel) {
        this.config.transports.forEach((transport) => {
            transport.loglvl = loglevel;
        });
    }
    //#endregion

    //#region private functions
    private writeLog(input: string, loglevel: number, logType: number): void {

        for (const transport of this.config.transports) {
            if (loglevel >= transport.loglvl) {
                this.writeTypeConsole(input, logType);
            }
        }
    }

    private writeTypeConsole(input: string, logType: number): void {
        switch (logType) {
            case EConsoleType.warn:
                console.warn(input);
                break;
            case EConsoleType.error:
                console.error(input);
                break;

            default:
                console.log(input);
                break;
        }
    }

    private setConfig(config?: IClientConfig): IMergedConfig {

        let mergedConfig: IMergedConfig = {
            transports: []
        };

        try {

            if (typeof (config) === "undefined") {
                let defaultTransportConsol = new DefaultConsolTransport();
                mergedConfig.transports.push(defaultTransportConsol);
                return mergedConfig;
            }

            if (config.transports.length === 0) {
                let defaultTransportConsol = new DefaultConsolTransport();
                defaultTransportConsol.baseComment = config.baseComment ? config.baseComment : defaultTransportConsol.baseComment;
                defaultTransportConsol.loglvl = typeof (config.loglvl) !== "undefined" ? config.loglvl : defaultTransportConsol.loglvl;
                mergedConfig.transports.push(defaultTransportConsol);
                return mergedConfig;
            }

            for (const transport of config.transports) {
                let mergedTransport = new BaseTransport();

                let base = transport.baseComment ? transport.baseComment : (config.baseComment ? config.baseComment : null);
                let loglvl = typeof (transport.loglvl) !== "undefined" ? transport.loglvl :
                    (typeof (config.loglvl) !== "undefined" ? config.loglvl : null);

                mergedTransport.baseComment = base ?? mergedTransport.baseComment;
                mergedTransport.loglvl = loglvl ?? mergedTransport.loglvl;
                mergedTransport.showBaseComment = transport.showBaseComment ?? mergedTransport.showBaseComment;
                mergedTransport.showDate = transport.showDate ?? mergedTransport.showDate;
                mergedTransport.showLoglevel = transport.showLoglevel ?? mergedTransport.showLoglevel;

                mergedTransport = new DefaultConsolTransport(mergedTransport);

                mergedConfig.transports.push(mergedTransport);
            }

        } catch (error) {
            console.error("error in set Config of Logger: ", error);
        }

        return mergedConfig;
    }

    private configureOutput(args: any[], loglevel: number, transport: ITransport): string {
        try {
            let returnString: string = ``;
            returnString += transport.showDate ? `${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()} - ` : ``;
            returnString += transport.showLoglevel ? `${ELoglevel[loglevel]} - ` : ``;
            returnString += transport.showBaseComment ? `${transport.baseComment.toString()} - ` : ``;

            for (const arg of args) {
                returnString += typeof (arg) === "string" ? arg : `${JSON.stringify(arg)}`;
            }
            return returnString;
        } catch (error) {
            console.error("error in configure output in logger: ", error);
            return "ERROR, check config and input";
        }
    }
    //#endregion

}

export {
    Logger,
    ELoglevel,
    ETransportType,
    EConsoleType,
    ILogger,
    IClientConfig,
    ITransport,
    IMergedConfig,
    DefaultConsolTransport,
    BaseTransport
};