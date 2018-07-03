import { IDataLabel } from "./interfaces";

export function waitOnDefined<T>(property: Object, path: string, time?: number): Promise<T> {

    return new Promise((resolve, reject) => {
        let counter = 0;
        let timeout = 100;

        (function waitForData() {
            console.log("waitForData");

            try {
                console.log("Found in wait");
                return resolve(getProperty<T>(property, path));
            } catch (error) {
                console.log("not Found in wait");

                if (typeof(time)!=="undefined" && counter>time/timeout) {
                    let error = new Error("Property not set in time");
                    return reject(error);
                }

                counter++;
                setTimeout(waitForData, timeout);
            }

        })();
    });
}


export function propertyHelper<T>(scope: Object, path: string, searchString?: string, time?: number, defaultReturn?: T): Promise<T> | T {

    let result: T;
    try {
        console.log("Found global");
        result = getProperty<T>(scope, path);
    } catch (error) {
        return waitOnDefined<T>(scope, path, time)
        .then((res) => {
            if (typeof(searchString)==="undefined" || searchString==="") {
                return res;
            }
            try {
                for (const library of res as any) {
                    if (library.value === searchString) {
                        console.log("## library.content ##", library.content);
                        return library.content;
                    }
                }
            } catch (error) {
                return res;
            }

        })
        .catch((error) => {
            if (typeof(defaultReturn)!=="undefined") {
                return defaultReturn;
            }
            throw error;
        });
    }

    if (typeof(result)!=="undefined") {
        return result;
    }
}

function getProperty<T>(scope: Object, path: string): T {
    let properties: string[] = path.split("/");
    let propertyPathDefined: boolean = true;
    for (const property of properties) {
        if (!scope.hasOwnProperty(property)) {
            propertyPathDefined = false;
        }
        if(propertyPathDefined) {
            scope = scope[property];
        }
    }
    if (propertyPathDefined) {
        return scope as T;
    }
    let error: Error = new Error("Property Path not fined");
    throw error;
}