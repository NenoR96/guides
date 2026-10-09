const path = require("node:path");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const ZipWebpackPlugin = require("zip-webpack-plugin");

const pages = [
  "control/content/index.html",
  "control/design/index.html",
  "control/settings/index.html",
  "widget/index.html",
];

const scripts = [
  "shared/guides-home-contract",
  "shared/guides-catalog-sync",
  "control/content/migrate-existing-content",
  "control/content/release-manager",
  "widget/guides-home-contract",
  "widget/progress-store",
  "widget/release-runtime",
];

module.exports = (_env, argv = {}) => {
  const production = argv.mode !== "development";

  return {
    context: __dirname,
    mode: production ? "production" : "development",
    target: "web",
    devtool: production ? false : "source-map",
    entry: Object.fromEntries(scripts.map((script) => [script, `./${script}.js`])),
    output: {
      path: path.resolve(__dirname, "dist"),
      filename: "[name].js",
      publicPath: "",
      clean: true,
    },
    plugins: [
      new CopyWebpackPlugin({
        patterns: [
          { from: "plugin.json" },
          { from: "resources", to: "resources" },
        ],
      }),
      // Keep the existing script order and BuildFire-relative SDK URLs.
      ...pages.map((page) => new HtmlWebpackPlugin({
        filename: page,
        template: path.resolve(__dirname, page),
        inject: false,
        minify: production ? {
          collapseWhitespace: true,
          keepClosingSlash: true,
          minifyCSS: true,
          minifyJS: true,
          removeComments: true,
          removeRedundantAttributes: false,
        } : false,
      })),
      ...(production ? [new ZipWebpackPlugin({
        path: __dirname,
        filename: "guides.zip",
      })] : []),
    ],
    performance: { hints: false },
  };
};
