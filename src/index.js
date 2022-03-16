import { Dropbox } from "dropbox";
import { default as Options } from "@jhanssen/options";
import { watch } from "chokidar";
import { readFile } from "node:fs/promises";
import { join as pathJoin } from "node:path";

const options = Options("video-upload-dropbox");
const refreshToken = options("refresh-token");
const clientId = options("client-id");
const clientSecret = options("client-secret");
const watches = options.json("watches");
const uploadTimeout = options.int("upload-timeout", 5000);

if (typeof refreshToken !== "string" || refreshToken.length === 0) {
    console.error("no refresh token");
    process.exit(1);
}
if (typeof clientId !== "string" || clientId.length === 0) {
    console.error("no client id");
    process.exit(1);
}
if (typeof clientSecret !== "string" || clientSecret.length === 0) {
    console.error("no client secret");
    process.exit(1);
}

if (!(watches instanceof Array)) {
    console.error("watches needs to be an array");
    process.exit(1);
}
for (const w of watches) {
    if (typeof w !== "object") {
        console.error("watch needs to be an object");
        process.exit(1);
    }
    if (typeof w.dir !== "string") {
        console.error("watch.dir needs to be a string");
        process.exit(1);
    }
    if (w.filter !== undefined) {
        if (typeof w.filter !== "string") {
            console.error("watch.filter needs to be undefined or a string");
            process.exit(1);
        } else {
            // make filter be a regex
            try {
                w.filter = new RegExp(w.filter);
            } catch (e) {
                console.error("watch.filter not a valid regexp", e.message);
                process.exit(1);
            }
        }
    }
}

let timer = undefined;
let files = [];

function removeSlash(p) {
    if (typeof p === "string" && p[0] === "/")
        return p.substr(1);
    return p;
}

function stripPath(p) {
    for (const w of watches) {
        if (p.indexOf(w.dir) === 0) {
            let ls = w.dir.lastIndexOf("/");
            if (ls === w.dir.length - 1 && ls > 0) {
                ls = w.dir.lastIndexOf("/", ls - 1);
            }
            if (ls !== -1)
                return removeSlash(p.substr(ls));
            return removeSlash(p.substr(w.dir.length));
        }
    }
    return removeSlash(p);
}

async function uploadFiles(subfiles) {
    const dbx = new Dropbox({ clientId, clientSecret, refreshToken });

    for (let f of subfiles) {
        if (f.filter !== undefined && !f.filter.test(f.file)) {
            console.log("skipping", stripPath(f.file));
            continue;
        }
        const contents = await readFile(f.file);
        try {
            const ret = await dbx.filesUpload({ path: "/" + stripPath(f.file), contents: contents });
            if (ret.status !== 200) {
                throw new Error(`Failed to upload ${JSON.stringify(ret)}`);
            }
            console.log("uploaded", stripPath(f.file));
        } catch (e) {
            if (e.code === "ECONNREFUSED") {
                // retry
                addUploadFile(f.file, f.filter);
            } else {
                throw e;
            }
        }
    }
}

function addUploadFile(file, filter) {
    files.push({ file, filter });
    if (timer !== undefined)
        clearTimeout(timer);
    timer = setTimeout(() => {
        const f = files;
        files = [];

        uploadFiles(f).then(() => {
        }).catch(e => {
            console.error(e);
        });

        timer = undefined;
    }, uploadTimeout);
}

console.log("watching", watches);

for (const w of watches) {
    watch(w.dir, { ignoreInitial: true }).on("all", (event, path) => {
        if (event === "add") {
            console.log("file added", path);
            addUploadFile(path, w.filter);
        }
    });
}
