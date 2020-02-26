import { INxAppPropertiesExtended, IGenericBookmarkLayoutMetaExtended, IGenericBookmarkExtended } from "./interfaces";

interface IMetaBookmarkExtended extends EngineAPI.INxMetaTitleDescription {
    privileges: string[]
}
export class AppObject {

    private app: EngineAPI.IApp;

    public appId: string;
    public appIsPublic: boolean;


    constructor(app: EngineAPI.IApp) {
        this.app = app;
        this.getIsPublished();
        this.getAppId();
    }

    public async getSheetId(objectId: string): Promise<string> {
        return new Promise((resolve, reject) => {

            this.app.getAllInfos()
                .then((allInfo) => {
                    let sheets: EngineAPI.INxInfo[] = [];
                    for (const info of allInfo) {
                        if (info.qType === "sheet") {
                            sheets.push(info);
                        }
                    }
                    for (const sheet of sheets) {
                        let sheetObject: EngineAPI.IGenericObject;
                        this.app.getObject(sheet.qId)
                            .then((res) => {
                                sheetObject = res;
                                return res.getFullPropertyTree();
                            })
                            .then((res) => {
                                for (const iterator of res.qChildren) {
                                    if (iterator.qProperty.qInfo.qId === objectId) {
                                        resolve(sheetObject.id);
                                    }
                                }
                                resolve(null);
                            })
                            .catch((error) => {
                                Promise.reject(error);
                            });
                    }
                })
                .catch((error) => {
                    reject(error);
                });
        });
    }

    public async getUsername(): Promise<string> {
        return new Promise((resolve, reject) => {
            this.app.evaluateEx("=OSUser()")
                .then((res) => {
                    let uArr = res.qText.split(";");
                    resolve(`${uArr[0].split("=")[1]}/${uArr[1].split("=")[1]}`);
                })
                .catch((error) => {
                    reject(error);
                });
        });
    }

    public async getAppId(): Promise<string> {
        return new Promise((resolve, reject) => {
            this.app.getAppLayout()
                .then((res) => {
                    this.appId = res.qFileName;
                    resolve(res.qFileName);
                })
                .catch((error) => {
                    reject(error)
                });
        });
    }

    public async getIsPublished(): Promise<boolean> {
        return new Promise((resolve, reject) => {
            this.app.getAppProperties()
                .then((appProperties: INxAppPropertiesExtended) => {
                    let appPublished = false;
                    if (typeof (appProperties.published) !== "undefined") {
                        appPublished = appProperties.published;
                    }
                    this.appIsPublic = appPublished;
                    resolve(appPublished);
                })
                .catch((error) => {
                    reject(error);
                });
        });
    }

    private async destroyExistingBookmark(id: string): Promise<void> {
        return new Promise((resolve, reject) => {
            let obj: EngineAPI.IGenericBookmark;
            this.app.getBookmark(id)
                .then((object) => {
                    obj = object;
                    return obj.getLayout();
                })
                .then((layout) => {
                    try {
                        let meta: IGenericBookmarkLayoutMetaExtended = layout.qMeta as IGenericBookmarkLayoutMetaExtended;
                        if (typeof (meta.published) !== "undefined"
                            && typeof (meta.privileges) !== "undefined"
                            && meta.privileges.indexOf("publish") !== -1
                            && !meta.approved) {
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
                            return this.app.destroyBookmark(id);
                        }
                    } catch (error) {
                        reject(error);
                    }
                })
                .then(() => {
                    resolve();
                })
                .catch((error) => {
                    reject(error);
                });
        });
    }

    public async createBookmark(tagName: string, appIsPublished): Promise<string> {
        return new Promise((resolve, reject) => {
            let bookmarkId: string = "";
            let bookmarkProperties: EngineAPI.IGenericBookmarkProperties = {
                qInfo: {
                    qType: "hiddenbookmark"
                },
                qMetaDef: {
                    title: "SerOnDemandBookmark",
                    tags: [tagName],
                    approved: false
                },
                creationDate: (new Date()).toISOString()
            };

            this.app.getBookmarks({
                qTypes: ["hiddenbookmark"],
                qData: {}
            })
                .then((bookmarks) => {
                    let proms: Promise<void>[] = [];
                    let bookmarksTyped: EngineAPI.INxContainerEntry<any>[] = bookmarks as any;
                    for (const bookmark of bookmarksTyped) {
                        let meta: IGenericBookmarkLayoutMetaExtended = bookmark.qMeta as IGenericBookmarkLayoutMetaExtended;
                        if (typeof meta.tags !== "undefined" && meta.tags.indexOf(tagName) > -1) {
                            proms.push(this.destroyExistingBookmark(bookmark.qInfo.qId));
                        }
                    }
                    return Promise.all(proms);
                })
                .then(() => {
                    return this.app.createBookmark(bookmarkProperties);
                })
                .then((bookmarkObject: IGenericBookmarkExtended) => {
                    bookmarkId = bookmarkObject.id;

                    switch (appIsPublished) {
                        case true:
                            return bookmarkObject.publish();

                        default:
                            return this.app.doSave();
                    }
                })
                .then(() => {
                    resolve(bookmarkId);
                })
                .catch((error) => {
                    reject(error);
                });
        });
    }

    public async sufficientRightsBookmark(rights: string[]): Promise<boolean> {

        const title = "SerOnDemandCheckRightBookmark";
        let checker = true;

        let bookmarkProperties: EngineAPI.IGenericBookmarkProperties = {
            qInfo: {
                qType: "hiddenbookmark"
            },
            qMetaDef: {
                title: title,
                approved: false
            },
            creationDate: (new Date()).toISOString()
        };

        const bookmarkObject = await this.app.createBookmark(bookmarkProperties);
        const bookmarkLayout = await bookmarkObject.getLayout();

        checker = !rights.some((right) => (bookmarkLayout.qMeta as IMetaBookmarkExtended).privileges.indexOf(right) === -1);

        await this.app.destroyBookmark(bookmarkLayout.qInfo.qId);
        return checker;
    }

}