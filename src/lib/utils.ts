export function waitOnDefined<T>(property: Object, path: string, time: number): Promise<T> {

    return new Promise((resolve, reject) => {
        let counter = 0;
        let timeout = 100;

        (function waitForData() {
            try {
                resolve(getProperty<T>(property, path));
            } catch (error) {
                if (typeof (time) !== "undefined" && counter > time / timeout) {
                    let error = new Error("Property not set in time");
                    reject(error);
                }
                counter++;
                setTimeout(waitForData, timeout);
            }

        })();
    });
}

export function propertyHelperLibaries<T>(scope: Object, path: string, time: number, defaultReturn?: T): T {

    try {

        return getProperty<T>(scope, path);
    } catch (error) {

        let calcPromise = waitOnDefined<T>(scope, path, time)
            .catch((error) => {
                if (typeof (defaultReturn) !== "undefined") {
                    return defaultReturn;
                }
                throw error;
            });
        calcPromise
        .then((res) => {
            return res;
        })
        .catch((e) => {
            return null;
        })
    }
}

export function propertyHelperContent<T>(scope: Object, path: string, searchString: string, time: number, defaultReturn?: T): T {

    let result: T;
    try {

        result = getProperty<T>(scope, path);
        return getContentByLibaryName(result, searchString);

    } catch (error) {

        let calcPromise = new Promise<T>((resolve, reject) => {
            waitOnDefined<T>(scope, path, time)
                .then((res) => {
                    return resolve(getContentByLibaryName(res, searchString));
                })
                .catch((error) => {
                    if (typeof (defaultReturn) !== "undefined") {
                        return defaultReturn;
                    }
                    throw error;
                });
        });
        calcPromise
        .then((res) => {
            return res;
        })
        .catch((e) => {
            return null;
        })
    }
}

function getContentByLibaryName(result: any, searchString: string) {
    for (const library of result as any) {
        if (library.value === searchString) {
            return library.content;
        }
    }
}

function getProperty<T>(scope: Object, path: string): T {
    let properties: string[] = path.split("/");
    let propertyPathDefined: boolean = true;
    for (const property of properties) {
        if (!scope.hasOwnProperty(property)) {
            propertyPathDefined = false;
        }
        if (propertyPathDefined) {
            scope = scope[property];
        }
    }
    if (propertyPathDefined) {
        return scope as T;
    }
    let error: Error = new Error("Property Path not fined");
    throw error;
}