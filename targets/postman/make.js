var path = require("path");

// Making resharper less noisy - These are defined in Generate.js
if (typeof (getCompiledTemplate) === "undefined") getCompiledTemplate = function () { };

var propertyReplacements = {};

exports.makeCombinedAPI = function (apis, sourceDir, apiOutputDir) {
    console.log("Generating Postman combined Collection to " + apiOutputDir);

    try {
        propertyReplacements = require(path.resolve(sourceDir, "replacements.json"));
    } catch (ex) {
        throw "The file: replacements.json was not properly formatted JSON";
    }

    for (var a = 0; a < apis.length; a++) {
        apis[a].calls.sort(callSorter);
    }

    var locals = {
        sdkVersion: sdkGlobals.sdkVersion,
        apis: apis,
        getPostmanDescription: getPostmanDescription,
        getPostmanHeader: getPostmanHeader,
        getRequestExample: getRequestExample,
        getUrl: getUrl,
        getVerticalTag: getVerticalTag,
        getTestScripts: getTestScripts,
    };

    var outputFile = path.resolve(apiOutputDir, "playfab.json");
    var templateDir = path.resolve(sourceDir, "templates");
    var apiTemplate = getCompiledTemplate(path.resolve(templateDir, "playfab.json.ejs"));
    writeFile(outputFile, apiTemplate(locals));

    try {
        require(outputFile); // Read the destination file and make sure it is correctly formatted json
    } catch (ex) {
        throw "The Postman Collection output was not properly formatted JSON:\n" + outputFile;
    }
}

function callSorter(a, b) {
    if (a.name > b.name) {
        return 1;
    }
    if (a.name < b.name) {
        return -1;
    }
    // a must be equal to b
    return 0;
}

function getUrl(apiCall) {

    if (sdkGlobals.verticalName)
        // verticalName isn't an established variable in Postman, and we know it here, so we can just apply it
        return "https://" + sdkGlobals.verticalName + ".playfabapi.com" + apiCall.url + "?sdk=PostmanCollection-" + sdkGlobals.sdkVersion;
    return "https://{{TitleId}}.playfabapi.com" + apiCall.url + "?sdk=PostmanCollection-" + sdkGlobals.sdkVersion;
}

function getPostmanHeader(apiCall) {
    if (apiCall.url === "/Authentication/GetEntityToken")
        return "X-PlayFabSDK: PostmanCollection-" + sdkGlobals.sdkVersion + "\\nContent-Type: application/json\\nX-Authorization: {{SessionTicket}}\\nX-SecretKey: {{SecretKey}}\\n";
    if (apiCall.auth === "SessionTicket")
        return "X-PlayFabSDK: PostmanCollection-" + sdkGlobals.sdkVersion + "\\nContent-Type: application/json\\nX-Authorization: {{SessionTicket}}\\n";
    else if (apiCall.auth === "SecretKey")
        return "X-PlayFabSDK: PostmanCollection-" + sdkGlobals.sdkVersion + "\\nContent-Type: application/json\\nX-SecretKey: {{SecretKey}}\\n";
    else if (apiCall.auth === "EntityToken")
        return "X-PlayFabSDK: PostmanCollection-" + sdkGlobals.sdkVersion + "\\nContent-Type: application/json\\nX-EntityToken: {{EntityToken}}\\n";
    else if (apiCall.auth === "None")
        return "X-PlayFabSDK: PostmanCollection-" + sdkGlobals.sdkVersion + "\\nContent-Type: application/json\\n";

    return "";
}

function jsonEscape(input) {
    if (input != null)
        input = input.replace(/\r/g, "").replace(/\n/g, "\\n").replace(/"/g, "\\\"");
    return input;
}

function getPostmanDescription(api, apiCall) {
    var isProposed = apiCall.hasOwnProperty("deprecation");
    var isDeprecated = isProposed && (new Date() > new Date(apiCall.deprecation.DeprecatedAfter));

    var output = "";
    if (isProposed && !isDeprecated)
        output += "As of " + apiCall.deprecation.ProposedAfter + ", this API has been proposed for deprecation. As of " + apiCall.deprecation.DeprecatedAfter + ", it will be officially deprecated and no longer supported.\\n\\n";
    else if (isProposed && isDeprecated)
        output += "As of " + apiCall.deprecation.ProposedAfter + ", this API has been deprecated. As of " + apiCall.deprecation.ObsoleteAfter + ", it will be officially obsolete and no longer published in the SDKs.\\n\\n";
    if (isProposed && apiCall.deprecation.ReplacedBy)
        output += "Please use the replacement API instead: " + apiCall.deprecation.ReplacedBy + "\\n\\n";

    if (isDeprecated)
        return output;

    output += jsonEscape(apiCall.summary); // Make sure quote characters are properly escaped
    if (!isProposed)
        output += "\\n\\nApi Documentation: https://docs.microsoft.com/rest/api/playfab/" + api.name.toLowerCase() + "/" + apiCall.subgroup.toLowerCase().replaceAll(" ", "-") + "/" + apiCall.name.toLowerCase();

    output += "\\n\\n**The following case-sensitive environment variables are required for this call:**";
    output += "\\n\\n\\\"TitleId\\\" - The Title Id of your game, available in the Game Manager (https://developer.playfab.com)";
    if (apiCall.auth === "SessionTicket")
        output += "\\n\\n\\\"SessionTicket\\\" - The string returned as \\\"SessionTicket\\\" in response to any Login method.";
    if (apiCall.auth === "SecretKey")
        output += "\\n\\n\\\"SecretKey\\\" - The PlayFab API Secret Key, available in Game Manager for your title (https://developer.playfab.com/{{titleId}}/settings/credentials)";
    if (apiCall.auth === "EntityToken")
        output += "\\n\\n\\\"EntityToken\\\" - The string returned as \\\"EntityToken.EntityToken\\\" in response to any Login method.";

    var props = api.datatypes[apiCall.request].properties;
    if (props.length > 0)
        output += "\\n\\n**The body of this api-call should be proper json-format.  The api-body accepts the following case-sensitive parameters:**";
    for (var p = 0; p < props.length; p++) {
        output += "\\n\\n\\\"" + props[p].name + "\\\": " + jsonEscape(props[p].description);
    }

    output += "\\n\\nTo set up an Environment, click the text next to the eye icon up top in Postman (it should say \"No environment\", if this is your first time using Postman). Select \"Manage environments\", then \"Add\". Type a name for your environment where it says \"New environment\", then enter each variable name above as the \"Key\", with the value as defined for each above.".replace(/"/g, "\\\"");

    return output;
}

function getCorrectedRequestExample(api, apiCall) {
    var output = JSON.parse(apiCall.requestExample);
    checkReplacements(api, output);
    return "\"" + jsonEscape(JSON.stringify(output, null, 2)) + "\"";
}

function doReplace(obj, paramName, newValue) {
    if (obj.hasOwnProperty(paramName)) {
        console.log("Replaced: " + obj[paramName] + " with " + newValue);
        obj[paramName] = newValue;
    }
};

function checkReplacements(api, obj) {
    for (var replaceCategory in propertyReplacements) {
        if (replaceCategory === "generic") {
            for (var genReplaceName1 in propertyReplacements[replaceCategory])
                doReplace(obj, genReplaceName1, propertyReplacements[replaceCategory][genReplaceName1]);
        }
        if (replaceCategory === api.name) {
            for (var apiReplaceName in propertyReplacements[replaceCategory]) {
                if (apiReplaceName === "generic") {
                    for (var genReplaceName2 in propertyReplacements[replaceCategory][apiReplaceName])
                        doReplace(obj, genReplaceName2, propertyReplacements[replaceCategory][apiReplaceName][genReplaceName2]);
                }
                doReplace(obj, apiReplaceName, propertyReplacements[replaceCategory][apiReplaceName]);
            }
        }
    }
}

function getRequestExample(api, apiCall) {
    var msg = null;
    var egJSONStr = "";
    switch (api.name.toLowerCase() + "-" + apiCall.name) {
        case "client-LoginWithEmailAddress":
            msg = "{\n  \"Email\": \"{{PFEmail}}\",\n  \"Password\": \"{{PFPsd}}\",\n  \"TitleId\": \"{{TitleId}}\"\n}";
            return JSON.stringify(msg, null, 2);
            break;
        case "multiplayer-CreateMatchmakingTicket":
            msg = "{\n  \"Creator\": {\n  \t\"Attributes\":{\n  \t\t\"DataObject\": {\n  \t\t\t\"Team\" : \"TeamA\",\n  \t\t\t\"Latency\": [\n  \t\t\t{\"region\": \"EastUs\",\"latency\": 400},\n  \t\t\t{\"region\": \"WestUs\",\"latency\": 100}\n  \t\t\t]\n  \t\t}\n  \t},\n  \t\"Entity\":{\n  \t\t\"Id\":\"{{PlayerEntityId}}\",\n  \t\t\"Type\":\"title_player_account\"\n  \t}\n  },\n  \"MembersToMatchWith\": [],\n  \"GiveUpAfterSeconds\": 300,\n  \"QueueName\": \"{{MatchQueue}}\"\n}";
            return JSON.stringify(msg, null, 2);
            break;
        case "multiplayer-CancelAllMatchmakingTicketsForPlayer":
            msg = "{\n  \"Entity\": {\n    \"Id\": \"{{PlayerEntityId}}\",\n    \"Type\": \"title_player_account\",\n    \"TypeString\": \"title_player_account\"\n  },\n  \"QueueName\": \"{{MatchQueue}}\"\n}";
            return JSON.stringify(msg, null, 2);
            break;
        case "multiplayer-CancelMatchmakingTicket":
            msg = "{\n  \"TicketId\": \"{{MatchmakingTicketId}}\",\n  \"QueueName\": \"{{MatchQueue}}\"\n}";
            return JSON.stringify(msg, null, 2);
            break;
        case "multiplayer-GetMatchmakingTicket":
            msg = "{\n  \"TicketId\": \"{{MatchmakingTicketId}}\",\n  \"QueueName\": \"{{MatchQueue}}\",\n  \"EscapeObject\": false\n}";
            return JSON.stringify(msg, null, 2);
            break;
        case "multiplayer-JoinMatchmakingTicket":
            msg = "{\n  \"TicketId\": \"{{MatchmakingTicketId}}\",\n  \"QueueName\": \"{{MatchQueue}}\",\n  \"Member\": {\n  \t\"Attributes\":{\n  \t\t\"DataObject\": {\n  \t\t\t\"Team\" : \"TeamA\",\n  \t\t\t\"Latency\": [\n  \t\t\t{\"region\": \"EastUs\",\"latency\": 400},\n  \t\t\t{\"region\": \"WestUs\",\"latency\": 100}\n  \t\t\t]\n  \t\t}\n  \t},\n  \t\"Entity\":{\n  \t\t\"Id\":\"{{PlayerEntityId}}\",\n  \t\t\"Type\":\"title_player_account\"\n  \t}\n  }\n}";
            return JSON.stringify(msg, null, 2);
            break;
        case "multiplayer-ListMatchmakingTicketsForPlayer":
            msg = "{\n  \"Entity\": {\n    \"Id\": \"{{PlayerEntityId}}\",\n    \"Type\": \"title_player_account\",\n    \"TypeString\": \"title_player_account\"\n  },\n  \"QueueName\": \"{{MatchQueue}}\"\n}";
            return JSON.stringify(msg, null, 2);
            break;
        case "cloudscript-ExecuteFunction":
            msg = "{\n  \"FunctionName\": \"HttpTriggerTest\",\n  \"FunctionParameter\": {\n    \"name\": \"UserA\",\n    },\n  \"GeneratePlayStreamEvent\": true,\n  \"Entity\": {\n    \"Id\": \"{{PlayerEntityId}}\",\n    \"Type\": \"title_player_account\",\n    \"TypeString\": \"title_player_account\"\n  }\n}";
            return JSON.stringify(msg, null, 2);
            break;
        default:
    }

    if (apiCall.requestExample.length > 0 && apiCall.requestExample.indexOf("{") >= 0) {
        if (apiCall.requestExample.indexOf("\\\"") === -1) // I can't handle json in a string in json in a string...
            return getCorrectedRequestExample(api, apiCall);
        else
            msg = "CANNOT PARSE EXAMPLE BODY: ";
    }

    var props = api.datatypes[apiCall.request].properties;
    var output = {};
    for (var p = 0; p < props.length; p++) {
        output[props[p].name] = props[p].jsontype;
    }

    if (msg == null)
        msg = "AUTO GENERATED BODY FOR: ";
    console.log(msg + api.name + "." + apiCall.name);
    // console.log("    " + JSON.stringify(output, null, 2));
    return "\"" + jsonEscape(JSON.stringify(output, null, 2)) + "\"";;
}

function getVerticalTag() {
    if (sdkGlobals.verticalName)
        return " for vertical: " + sdkGlobals.verticalName;
    return "";
}

function getTestScripts(apiName, apiCall) {
    var output = "";
    var eventJSONStr = "";
    switch (apiName + "-" + apiCall.name) {
        case "client-LoginWithEmailAddress":
            var obj = {
                "listen": "test",
                "script": {
                    "id": "49915f32-fe73-4415-80b0-0fdefb1e931d",
                    "exec": [
                        "var jsonData = JSON.parse(responseBody);\r",
                        "postman.setEnvironmentVariable(\"SessionTicket\", jsonData.data.SessionTicket);\r",
                        "postman.setEnvironmentVariable(\"EntityToken\", jsonData.data.EntityToken.EntityToken);\r",
                        "postman.setEnvironmentVariable(\"PlayFabId\", jsonData.data.PlayFabId);\r",
                        "postman.setEnvironmentVariable(\"PlayerEntityId\", jsonData.data.EntityToken.Entity.Id);\r",
                        "postman.setEnvironmentVariable(\"PlayerEntityType\", jsonData.data.EntityToken.Entity.Type);"
                    ],
                    "type": "text/javascript"
                }
            };
            eventJSONStr = JSON.stringify(obj);
            break;
        case "client-LoginWithCustomID":
            var obj = {
                "listen": "test",
                "script": {
                    "id": "1f85969a-d922-4ee9-bdf6-dfa2a149ea07",
                    "exec": [
                        "var jsonData = JSON.parse(responseBody);\r",
                        "postman.setEnvironmentVariable(\"SessionTicket\", jsonData.data.SessionTicket);\r",
                        "postman.setEnvironmentVariable(\"EntityToken\", jsonData.data.EntityToken.EntityToken);\r",
                        "postman.setEnvironmentVariable(\"PlayFabId\", jsonData.data.PlayFabId);\r",
                        "postman.setEnvironmentVariable(\"PlayerEntityId\", jsonData.data.EntityToken.Entity.Id);\r",
                        "postman.setEnvironmentVariable(\"PlayerEntityType\", jsonData.data.EntityToken.Entity.Type);"
                    ],
                    "type": "text/javascript"
                }
            };
            eventJSONStr = JSON.stringify(obj);
            break;
        case "authentication-GetEntityToken":
            var obj = {
                "listen": "test",
                "script": {
                    "id": "368c1521-b16e-476b-9ff6-562126a4c211",
                    "exec": [
                        "var jsonData = JSON.parse(responseBody);\r",
                        "postman.setEnvironmentVariable(\"EntityToken\", jsonData.data.EntityToken);"
                    ],
                    "type": "text/javascript"
                }
            };
            eventJSONStr = JSON.stringify(obj);
            break;
        case "multiplayer-CreateMatchmakingTicket":
            var obj = {
                "listen": "test",
                "script": {
                    "id": "836444a6-3b38-4506-b91f-11f1049a726a",
                    "exec": [
                        "var jsonData = JSON.parse(responseBody);\r",
                        "postman.setEnvironmentVariable(\"MatchmakingTicketId\", jsonData.data.TicketId);"
                    ],
                    "type": "text/javascript"
                }
            };
            eventJSONStr = JSON.stringify(obj);
            break;
        case "multiplayer-GetMatchmakingTicket":
            var obj = {
                "listen": "test",
                "script": {
                    "id": "244e7c08-46ef-4992-bf31-cc7a53e0b35a",
                    "exec": [
                        "var jsonData = JSON.parse(responseBody);\r",
                        "postman.setEnvironmentVariable(\"MatchId\", jsonData.data.MatchId);"
                    ],
                    "type": "text/javascript"
                }
            };
            eventJSONStr = JSON.stringify(obj);
            break;
        default:
    }
    if (eventJSONStr)
        output = eventJSONStr.escapeSpecialChars();
    return output;
}

String.prototype.escapeSpecialChars = function () {
    return this.replace(/\\n/g, "\\n")
        .replace(/\\'/g, "\\'")
        .replace(/\\"/g, '\\"')
        .replace(/\\&/g, "\\&")
        .replace(/\\r/g, "\\r")
        .replace(/\\t/g, "\\t")
        .replace(/\\b/g, "\\b")
        .replace(/\\f/g, "\\f");
};