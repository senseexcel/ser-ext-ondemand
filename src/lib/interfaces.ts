//#region imports
import { logging }                      from "../node_modules/davinci.js/dist/umd/daVinci";

import { ISerConfig,
         ISerReport}                    from "../node_modules/ser.api/index";
import { EVersionOption,
         ETaskOption }                  from "./enums";
//#endregion

export interface ISERRequestStart extends ISerConfig {
    onDemand: boolean;
}

export interface ISerReportExtended extends ISerReport {
    distribute: ISERDistribute;
}

export interface ISERResponseStart {
    status: number;
    taskId: string;
}

export interface ISERResponseStatusVersion {
    name: string;
    version: string;
}

export interface ISERResponseStatus {
    status: number;
    log: string;
    link: string;
    taskId: string;
    versions: ISERResponseStatusVersion[];
}

export interface ISERRequestStatus {
    taskId?: string;
    versions?: EVersionOption | string;
    tasks?: ETaskOption | string;
}

export interface ISERDistribute {
    hub: ISERHub;
}

export interface ISERHub {
    mode: string;
    connections: string;
}

export interface ILayout {
    properties: IProperties;
}

export interface IProperties {
    template: string;
    output: string;
    selection: number;
    directDownload: boolean;
    loglevel?: logging.LogLevel;
}

export interface INxAppPropertiesExtended extends EngineAPI.INxAppProperties {
    published: boolean;
}

export interface IGenericBookmarkLayoutMetaExtended extends EngineAPI.INxMetaTitleDescription {
    published: boolean;
    privileges: string[];
    approved: boolean;
    title: string;
}

export interface IGenericBookmarkExtended extends EngineAPI.IGenericBookmark {
    id: string;
}



export interface IDataLabel {
    label: string;
    value: string | number;
}

export interface ILibrary extends IDataLabel {
    content?: IDataLabel[];
}
