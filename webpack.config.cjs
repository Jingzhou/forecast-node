const path = require('path');
const nodeExternals = require('webpack-node-externals');

module.exports = {
    entry: './src/main.mjs', // 项目入口文件
    output: {
        path: path.resolve(__dirname, 'dist'), // 打包后的文件目录
        filename: 'bundle.cjs' // 打包后的文件名
    },
    target: 'node', // 针对Node.js环境
    // externals: [nodeExternals()], // 外部依赖不打包
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader', // 使用Babel转译ES6
                    options: {
                        presets: ['@babel/preset-env']
                    }
                }
            }
        ]
    }
};
