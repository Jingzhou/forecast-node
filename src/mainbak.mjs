import openai from 'openai'
import express from 'express'
import bodyParser from 'body-parser'
import cors from 'cors'
import {v4} from 'uuid'
import { RPCClient } from '@alicloud/pop-core'
import request from "request";
import axios from 'axios'
import * as cheerio from 'cheerio';
import dayjs from "dayjs";

const app = express()

app.use(cors()); // 解决跨域
app.use(bodyParser.urlencoded({extended: true, limit: '20mb'}));
app.use(bodyParser.json({limit: '20mb'})); // 处理json格式的数据请求


// kimi实例
const kimiClient = new openai.OpenAI({
    apiKey: "sk-IeRwQT3CBViaQpXSrbIg0joSykFRO1x0KNJWtAmoCEkAwctU", // 在这里将 MOONSHOT_API_KEY 替换为你从 Kimi 开放平台申请的 API Key
    baseURL: "https://api.moonshot.cn/v1",
});

// kimi初始化信息
const sysPromptContent = `你是一名懂得给不同年龄、不同文化水平、不同中英文语言能力的用户进行教学的专业的英语专家。你擅长中文和英文，中文和英文都是你的母语。\n
                        - 你能够支持最多10000字的输入和输出。\n
                        - 【重要】你需要帮助用户把他们发给你的{{文章内容}}，先翻译成英文，再总结成300个单词左右的英文文章。你只需要输出给用户最后总结好的300个单词左右的英文文章即可。\n
                        - 【重要】你最终输出的内容语言必须是英文。\n
                        - 【重要】你最终输出的内容必要是基于用户给你输入的文章信息。\n
                        - 【重要】你最终输出的内容，请参照english pod、bbc english learning播客的文案和语言风格，语调口语化一些，且具有趣味性。\n
                        - 【重要】输出的英语学习资料需要照顾用户的英语水平，目前用户的英语水平是{{B1中级用户(高中水平，2000-3000个词汇量)}}。\n
                        - 【重要】如果遇到超出用户英文水平的单词，即便是很难翻译成英文，你也要尽力用其他不改变原本意思的其他英文表达出来。你一定不能输出为其他语言，最终输出的文章必须是全英文章。\n
                        - 【重要】对于我提交的内容务必按以上的要求进行处理。\n
                        "请使用如下JSON格式输出你的回复：
                        {
                            "translation": "最终输出内容",
                        }
                        "
                        注意，请将最终输出内容放在'translation'字段中。`


// 阿里获取token实例
let tokenResult = {}
const ttsUrl = "https://nls-gateway-cn-shanghai.aliyuncs.com/rest/v1/tts/async"
const ttsAppKey = 'DCEbgB8cvNuPJaU2'
const rpcClient = new RPCClient({
    accessKeyId: 'YOUR_ALIBABA_CLOUD_ACCESS_KEY_ID',
    accessKeySecret: 'YOUR_ALIBABA_CLOUD_ACCESS_KEY_SECRET',
    endpoint: 'http://nls-meta.cn-shanghai.aliyuncs.com',
    apiVersion: '2019-02-28'
});
// 定时刷新阿里accessToken
const refreshAccessToken = () => {
    rpcClient.request('CreateToken').then((result) => {
        tokenResult = result.Token
        console.log('获取accessToken成功')
        setTimeout(() => {
            refreshAccessToken()
        }, 3600000)
    });
}
refreshAccessToken()

// 过滤正文前后换行符
const replaceNtoBr = (str) => {
    const replacedText = str.replace(/^\s+|\s+$/g, '')
    return replacedText
}

// 长文生成音频
const requestLongTts4Post = async (textValue) => {
    const context = {
        device_id : "device_id",
    };
    const header = {
        appkey : ttsAppKey,
        token : tokenResult.Id,
    };
    const tts_request = {
        text : textValue,
        voice : 'abby',
        format : 'wav',
        "sample_rate" : 16000,
        "speech_rate" : -200,
        "pitch_rate" : -30,
        "enable_subtitle" : false
    };
    const payload = {
        enable_notify: false,
        "tts_request" : tts_request,
    };
    const tts_body = {
        "context" : context,
        "header" : header,
        "payload" : payload
    };
    const bodyContent = JSON.stringify(tts_body);
    const httpHeaders = {'Content-type' : 'application/json'};
    const options = {
        url: ttsUrl,
        method: 'POST',
        headers: httpHeaders,
        body: bodyContent,
        encoding: null
    };
    return new Promise((resolve, reject) => {
        request(options, function (error, response, body) {
            // 处理服务端的响应。
            if (error != null) {
                return Promise.reject(error)
            } else {
                if(response.statusCode != 200) {
                    reject("Http Request Fail: " + response.statusCode + "; " + body.toString())
                }
                let code = 0;
                let task_id = "";
                let request_id = "";
                const json = JSON.parse(body.toString());
                for(let key in json){
                    if(key=='error_code'){
                        code = json[key]
                    } else if(key=='request_id'){
                        request_id = json[key]
                    } else if(key == "data") {
                        task_id = json[key]["task_id"];
                    }
                }
                if(code == 20000000) {
                    resolve({taskId: task_id, requestId: request_id})
                } else {
                    reject("Request Error: status=" + $data["status"] + "; error_code=" + $data["error_code"] + "; error_message=" + $data["error_message"])
                }
            }
        });
    })

}

// 获取音频连接
const fetchWebsiteContent = async ({taskId, requestId}) => {
    const fullUrl = ttsUrl + "?appkey=" + ttsAppKey + "&task_id=" + taskId + "&token=" + tokenResult.Id + "&request_id=" + requestId;
    const options = {
        url: fullUrl,
        method: 'GET'
    }
    return new Promise((resolve, reject) => {
        request(options, function (error, response, body) {
            // 处理服务端的响应。
            if (error != null) {
                reject(error);
            } else if(response.statusCode != 200) {
                reject("Http Request Fail: " + response.statusCode + "; " + body.toString());
            } else {
                let code = 0;
                let task_id = "";
                let request_id = "";
                let audio_address = "";
                let json = JSON.parse(body.toString());
                for(let key in json){
                    if(key=='error_code'){
                        code = json[key]
                    } else if(key=='request_id'){
                        request_id = json[key]
                    } else if(key == "data" && json["data"] != null) {
                        task_id = json[key]["task_id"];
                        audio_address = json[key]["audio_address"];
                    }
                }
                if(code == 20000000 && audio_address == null) {
                    resolve({taskId: task_id, requestId: request_id, audioAddress: ''})
                }
                else if(code == 20000000 && audio_address != "") {
                    resolve({taskId: task_id, requestId: request_id, audioAddress: audio_address})
                }
            }
        })
    })
}


// 生成译文
app.post('/api/createContent', async (req,res) => {
    console.log(`======调用生成译文接口======：${dayjs(new Date()).format('YYYY-MM-DD hh:mm')}`)
    const {url, promptContent} = req.body
    try {
        // 使用axios发送GET请求
        const { data: htmlData } = await axios.get(url);
        // 使用cheerio加载返回的HTML内容
        const $ = cheerio.load(htmlData);
        const title = replaceNtoBr($('.rich_media_title').text());
        const contentHtml = $('.rich_media_content').html();
        const $$ = cheerio.load(contentHtml);
        const content = []
        $$('p').each((index, element) => {
            const text = $$(element).text()
            if (text) {
                content.push(text)
            }
        });

        if(content.length) {
            console.log(`======文章内容======：${content.join('\n')}`)
            let messages = [{
                role: 'system',
                content: ''
            }]
            if (promptContent) {
                const customPromptContent = `${promptContent}
                        - 【重要】对于我提交的内容务必按以上的要求进行处理。\n
                        "请使用如下JSON格式输出你的回复：
                        {
                            "translation": "最终输出内容",
                        }
                        "
                        注意，请将最终输出内容放在'translation'字段中。`
                messages[0].content = customPromptContent
            } else {
                messages[0].content = sysPromptContent
            }
            console.log(`======设置的sysPrompt======：${messages[0].content}`)
            messages.push({role: 'user', content: `<article>${content.join('\n')}</article>，请按system prompt的要求处理`})
            const tts = {
                taskId: '',
                requestId: '',
                taskUrl: '',
            }
            let completion = await kimiClient.chat.completions.create({
                model: "moonshot-v1-32k",
                messages: messages,
                temperature: 0.3,
                response_format: {type: "json_object"},
            });
            let choice = completion.choices[0];
            console.log(choice)
            if (choice.finish_reason === "length") {  // <-- 当内容被截断时，finish_reason 的值为 length
                const prefix = completion.choices[0].message.content
                messages.push( {"role": "assistant", "content": prefix, "partial": true})
                completion = await kimiClient.chat.completions.create({
                    model: "moonshot-v1-32k",
                    messages: messages,
                    temperature: 0.3,
                    response_format: {type: "json_object"},
                    max_tokens: 86400,  // <-- 注意这里，我们将 max_tokens 的值设置为一个较大的值，以确保 Kimi 大模型能完整输出内容
                })
                choice = completion.choices[0];
                console.log(choice)  // <-- 在这里，你将看到 Kimi 大模型顺着之前已经输出的内容，继续将输出内容补全完整
            }


            const translation = JSON.parse(choice.message.content).translation
            const {taskId, requestId} = await requestLongTts4Post(translation)
            tts.taskId = taskId
            tts.requestId = requestId
            res.json({code: '0', data: {id: v4(), date: dayjs(new Date()).format('YYYY-MM-DD hh:mm'), tts, kimi: {...choice, url, title}}})
        } else {
            res.json({code: '1', messages: '获取文章内容失败'})
        }
    } catch (e) {
        console.log(e)
        res.json({code: '1', messages: e})
    }

})

app.post('/api/checkTTS', async (req,res) => {
    const {taskId, requestId} = req.body

    try {
        const result = await fetchWebsiteContent({taskId, requestId})
        res.json({code: '0', data: {...result}})
    } catch (e) {
        console.log(e)
        res.json({code: '1', messages: e})
    }

})

app.listen(8802, () => {
    console.log(`Server running on http://localhost:8802`);
})
