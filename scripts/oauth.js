import { createServer } from "node:http";
import { default as prompt } from "prompt";
import { default as fetch, Headers } from "node-fetch";
import open from "open";

const httpPort = 8087;
let login = undefined;

const schema = {
    properties: {
        app_key: {},
        app_secret: {}
    }
};

prompt.start();

const server = createServer((req, res) => {
    // console.log(req.url);
    // extract the code
    const coderx = /\?code=(.*)$/;
    const m = coderx.exec(req.url);
    if (m) {
        console.log(m[1]);

        const params = new URLSearchParams();
        params.append("grant_type", "authorization_code");
        params.append("code", m[1]);
        params.append("redirect_uri", `http://localhost:${httpPort}/`);

        const meta = {
            "Authorization": "Basic " + Buffer.from(login.app_key + ":" + login.app_secret).toString('base64')
        };
        const headers = new Headers(meta);

        fetch("https://api.dropbox.com/oauth2/token", { method: "POST", body: params, headers: headers }).then(res => {
            // console.log(res);
            res.json().then(t => {
                console.log("access_token", t.access_token);
                console.log("refresh_token", t.refresh_token);
            }).catch(e => {
                console.log(e);
            });
        });
    }

    res.writeHead(200);
    res.end();
});

async function go() {
    login = await prompt.get(schema);

    const url = `https://www.dropbox.com/oauth2/authorize?client_id=${login.app_key}&redirect_uri=http://localhost:${httpPort}/&response_type=code&token_access_type=offline`;

    await open(url);
}

server.listen(httpPort, "localhost", () => {
    console.log("server listening on", httpPort);

    go().then(() => {
    }).catch(e => {
        console.error(e);
        process.exit(1);
    });
});
