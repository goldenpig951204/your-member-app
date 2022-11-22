const {
    createProxyMiddleware,
    responseInterceptor
} = require("http-proxy-middleware");
const fs = require("fs");
const cheerio = require("cheerio");
const { JSON_to_URLEncoded, yourtextAuthLogin } = require("../services/utils");
const FormData = require("form-data");
const credentialModel = require("../models/credential");

const yourtextMiddleware = (prefix) => createProxyMiddleware({
    target: `https://yourtext.guru`,
    selfHandleResponse: true,
    changeOrigin: true,
    onProxyReq: (proxyReq, req) => {
        let userAgent = req.headers["user-agent"];
        let { cookie } = req.proxy;
        proxyReq.setHeader("user-agent", userAgent);
        proxyReq.setHeader("Cookie", cookie);
        
        if (["POST", "PATCH", "PUT"].includes(req.method)) {
            let contentType = proxyReq.getHeader("content-type");
            const writeBody = (bodyData) => {
                proxyReq.setHeader("content-length", Buffer.byteLength(bodyData));
                proxyReq.write(bodyData);
            }
            
            if (contentType && contentType.includes("application/json")) {
                writeBody(JSON.stringify(req.body));
            }

            if (contentType && contentType.includes("application/x-www-form-urlencoded")) {
                let body = JSON_to_URLEncoded(req.body);
                proxyReq.setHeader("content-type", "application/x-www-form-urlencoded");
                writeBody(body);
            }
            
            if (contentType && contentType.includes("multipart/form-data")) {
                const parts = (req.headers['content-type'] + '').split(/boundary=/);
                const boundary = parts[1];

                const form = new FormData();
                form.setBoundary(boundary);
                for (let name in req.body) {
                    form.append(name, req.body[name]);
                }
                for (let file of req.files) {
                    form.append(file["fieldname"], file.buffer, { filename: file["originalname"] });
                }
                let body = form.getBuffer();
                proxyReq.setHeader("content-type", req.headers["content-type"]);
                writeBody(body);
            }
        }
    },
    onProxyRes: responseInterceptor(
        async (responseBuffer, proxyRes, req, res) => {
            let domain = `https://${req.headers["host"]}`;
            
            if (req.url.match(/\.(css|json|js|text|png|jpg|map|ico|svg)/) || /^\/ajax/.test(req.path)) {
                return responseBuffer;
            }
            if (req.path == "/" || req.path == "/profil" || req.path == "/profil/subscribe") {
                proxyRes.statusCode = 301;
                proxyRes.headers["location"] = domain + "/orders/";
                res.statusCode = 301;
                res.setHeader("location", domain + "/orders/");
            }
            if (req.path == "/do-auto-login") {
                try {
                    let { username, password } = await credentialModel.findOne({"type": "yourtext"});
                    let result = await yourtextAuthLogin(username, password);
                    if (result) {
                        res.statusCode = 200;
                        return JSON.stringify({status: true});
                    } else {
                        res.statusCode = 200;
                        return JSON.stringify({status: false});
                    }
                } catch (err) {
                    res.statusCode = 200;
                    return JSON.stringify({status: false});
                }
            }
            if (typeof req.user == "object" && !req.user.isAdmin) {}
            if (proxyRes.headers["location"]) {
                proxyRes.headers["location"] = proxyRes.headers["location"].replace("https://yourtext.guru", domain);
                res.setHeader("location", proxyRes.headers["location"].replace("https://yourtext.guru", domain));
            }
            if (proxyRes.headers["content-type"] && proxyRes.headers["content-type"].includes("text/html")) {
                let response = responseBuffer.toString("utf-8");
                let $ = cheerio.load(response);
                let links = $("link");
                links.each(function() {
                    let href = $(this).attr("href");
                    if (href !== undefined) {
                        $(this).attr("href", href.replace("https://yourtext.guru", domain));
                    }
                });
                let forms = $("form");
                forms.each(function() {
                    let action = $(this).attr("action");
                    if (action !== undefined) {
                        $(this).attr("action", action.replace("https://yourtext.guru", domain));
                    }
                });
                let anchors = $("a");
                anchors.each(function() {
                    let href = $(this).attr("href");
                    if (href !== undefined) {
                        $(this).attr("href", href.replace("https://yourtext.guru", domain));
                    }
                });
                let scripts = $("script");
                scripts.each(function() {
                    let src = $(this).attr("src");
                    if (src == undefined) {
                        let content = $(this).html();
                        let newContent = content.replace(/https:\/\/yourtext.guru/g, domain);
                        $(this).html(newContent);
                    } else {
                        $(this).attr("src", src.replace("https://yourtext.guru", domain));
                    }
                });
                if (typeof req.user == "object" && !req.user.isAdmin) {
                    $("#navbar > .nav > li:nth-child(5) > ul > li:nth-child(1), #navbar > .nav > li:nth-child(5) > ul > li:nth-child(2)").remove();
                }
                if (req.path == "/login") {
                    let html = fs.readFileSync(__dirname + "/../views/yourtext-auth.ejs");
                    return html.toString();
                }
                return $.html();
            }
            return responseBuffer;
        }
    ),
    prependPath: true,
    secure: false,
    hostRewrite: true,
    headers: {
        referer: "https://yourtext.guru",
        origin: "https://yourtext.guru"
    },
    autoRewrite: true,
    ws: true
});



module.exports = yourtextMiddleware;