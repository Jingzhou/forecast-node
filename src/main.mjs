import openai from 'openai'
import express from 'express'
import bodyParser from 'body-parser'
import cors from 'cors'
import {v4} from 'uuid'
import dayjs from "dayjs";

const app = express()

app.use(cors()); // 解决跨域
app.use(bodyParser.urlencoded({extended: true, limit: '20mb'}));
app.use(bodyParser.json({limit: '20mb'})); // 处理json格式的数据请求


// kimi实例
const kimiClient = new openai.OpenAI({
    apiKey: "your api key", // 在这里将 MOONSHOT_API_KEY 替换为你从 Kimi 开放平台申请的 API Key
    baseURL: "https://api.moonshot.cn/v1",
});

const tools = [
    {
        "type": "builtin_function",
        "function": {
            "name": "$web_search",
        },
    }
];
const search_impl = (args) => {
    return args
}

// let messages = [];

let finishReason = null;

async function gerForecast(params, messages) {
    let msg_result = {}
    messages.push({role: "user", content: `我的问题[${params.question}], 小六壬卦象:[${params.short}], 小六壬卦象含义:[${params.paraphrase.join('')}]`})
    while (finishReason === null || finishReason === "tool_calls") {
        try {
            const completion = await kimiClient.chat.completions.create({
                model: "moonshot-v1-auto",
                messages: messages,
                temperature: 0.3,
                tools: tools,  // <-- 我们通过 tools 参数，将定义好的 tools 提交给 Kimi 大模型
            });
            const choice = completion.choices[0];
            finishReason = choice.finish_reason;
            if (finishReason === "tool_calls") { // <-- 判断当前返回内容是否包含 tool_calls
                messages.push(choice.message); // <-- 我们将 Kimi 大模型返回给我们的 assistant 消息也添加到上下文中，以便于下次请求时 Kimi 大模型能理解我们的诉求
                for (const toolCall of choice.message.tool_calls) { // <-- tool_calls 可能是多个，因此我们使用循环逐个执行
                    let tool_result = ''
                    const tool_call_name = toolCall.function.name;
                    const tool_call_arguments = JSON.parse(toolCall.function.arguments); // <-- arguments 是序列化后的 JSON Object，我们需要使用 JSON.parse 反序列化一下
                    if (tool_call_name == "$web_search") {
                        tool_result = search_impl(tool_call_arguments)
                    } else {
                        tool_result = 'no tool found'
                    }

                    messages.push({
                        "role": "tool",
                        "tool_call_id": toolCall.id,
                        "name": tool_call_name,
                        "content": JSON.stringify(tool_result), // <-- 我们约定使用字符串格式向 Kimi 大模型提交工具调用结果，因此在这里使用 JSON.stringify 将执行结果序列化成字符串
                    });
                }
            }
            msg_result = {code: '0', data: { content: choice.message.content, date: dayjs().format('YYYY-MM-DD HH:mm:ss'), id: v4() }, message: 'success'}; // <-- 在这里，我们才将模型生成的回复返回给用户
        } catch (e) {
            msg_result = {code: '1', data: {}, message: 'error'}
        }

    }
    return msg_result
}

async function gerDivination(params, messages) {
    let msg_result = {}
    messages.push({role: "user", content: `我的问题：{${params.question}}, 易经六十四卦卦象：${params.short}`})
    while (finishReason === null || finishReason === "tool_calls") {
        try {
            const completion = await kimiClient.chat.completions.create({
                model: "moonshot-v1-auto",
                messages: messages,
                temperature: 0.3,
                tools: tools,  // <-- 我们通过 tools 参数，将定义好的 tools 提交给 Kimi 大模型
            });
            const choice = completion.choices[0];
            finishReason = choice.finish_reason;
            if (finishReason === "tool_calls") { // <-- 判断当前返回内容是否包含 tool_calls
                messages.push(choice.message); // <-- 我们将 Kimi 大模型返回给我们的 assistant 消息也添加到上下文中，以便于下次请求时 Kimi 大模型能理解我们的诉求
                for (const toolCall of choice.message.tool_calls) { // <-- tool_calls 可能是多个，因此我们使用循环逐个执行
                    let tool_result = ''
                    const tool_call_name = toolCall.function.name;
                    const tool_call_arguments = JSON.parse(toolCall.function.arguments); // <-- arguments 是序列化后的 JSON Object，我们需要使用 JSON.parse 反序列化一下
                    if (tool_call_name == "$web_search") {
                        tool_result = search_impl(tool_call_arguments)
                    } else {
                        tool_result = 'no tool found'
                    }

                    messages.push({
                        "role": "tool",
                        "tool_call_id": toolCall.id,
                        "name": tool_call_name,
                        "content": JSON.stringify(tool_result), // <-- 我们约定使用字符串格式向 Kimi 大模型提交工具调用结果，因此在这里使用 JSON.stringify 将执行结果序列化成字符串
                    });
                }
            }
            msg_result = {code: '0', data: { content: choice.message.content, date: dayjs().format('YYYY-MM-DD HH:mm:ss'), id: v4() }, message: 'success'}; // <-- 在这里，我们才将模型生成的回复返回给用户
        } catch (e) {
            msg_result = {code: '1', data: {}, message: 'error'}
        }

    }
    return msg_result
}

app.post('/api/gerForecast', async (req,res) => {
    finishReason = null
    let messages = [
        {
            "role": "system",
            "content": "--- ## 背景 你是一位专业的小六壬解析师，擅长根据小六壬的占卜结果，结合所提出的问题，给出准确且深入的解读，帮助提问者理解其中蕴含的信息。解析的输出格式需严格按照 {卦象详解： \"\", 运势分析： \"\", 吉凶指引： \"\"} 进行。 ##技能 ### 技能1：小六壬结果解析 当接收到用户提供的小六壬占卜结果以及对应的问题后，详细分析结果所代表的含义，按照规定格式给出针对性、合理性且具有启发性的解读。在 “卦象详解” 中，详细阐述小六壬卦象本身含义；在 “运势分析” 里，结合问题分析当前运势状况；在 “吉凶指引” 中，明确指出事情的吉凶倾向并给予相应指引 。 ##限制 - 解读需基于小六壬的传统理论和含义，不得随意编造。 - 回答必须围绕用户提出的占卜结果和问题展开。 - 输出必须严格遵循 {卦象详解： \"\", 运势分析： \"\", 吉凶指引： \"\"} 的格式，以JSON的格式输出。 ---"
        },
    ];
    const {question, short, paraphrase} = req.body
    const result = await gerForecast({question, short, paraphrase}, messages)
    res.json(result)
})

app.post('/api/gerDivination', async (req,res) => {
    finishReason = null
    let messages = [
        {
            "role": "system",
            "content": "--- ## 背景 你是一位专业的易经六十四卦解析师，擅长根据易经六十四卦的占卜结果，结合所提出的问题，给出准确且深入的解读，帮助提问者理解其中蕴含的信息。解析的输出格式需严格按照 {卦象详解： \"\", 运势分析： \"\", 吉凶指引： \"\"} 进行。 ##技能 ### 技能1：易经六十四卦结果解析 当接收到用户提供的易经六十四卦占卜结果以及对应的问题后，详细分析结果所代表的含义，按照规定格式给出针对性、合理性且具有启发性的解读。在 “卦象详解” 中，详细阐述易经六十四卦卦象本身含义；在 “运势分析” 里，结合问题分析当前运势状况；在 “吉凶指引” 中，明确指出事情的吉凶倾向并给予相应指引 。 ##限制 - 解读需基于易经六十四卦的传统理论和含义，不得随意编造。 - 回答必须围绕用户提出的占卜结果和问题展开。 - 输出必须严格遵循 {卦象详解： \"\", 运势分析： \"\", 吉凶指引： \"\"} 的格式，以JSON的格式输出。 ---"
        },
    ];
    const {question, short} = req.body
    const result = await gerDivination({question, short}, messages)
    res.json(result)
})


app.listen(8802, () => {
    console.log(`Server running on http://localhost:8802`);
})
