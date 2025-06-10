var util = {}

function objStringify(obj) {
    return JSON.stringify(obj, (n, v) => {
        if (typeof v == "function")
            return v.toString();
        return v;
    });
}

function publicFunc() {
    let u = {}, settings = {}
    java.log(String(source.bookSourceComment).split("\n")[0]) // 输出书源信息
    java.log(`本地书源更新时间：${java.timeFormat(source.lastUpdateTime)}`) // 输出书源信息
    settings = JSON.parse(String(source.variableComment).match(RegExp(/{([\s\S]*?)}/gm)))
    if (settings !== null) {
        java.log("⚙️ 使用自定义设置")
    } else {
        settings = {}
        settings.CONVERT_CHINESE = true     // 搜索：搜索时进行繁简转换
        settings.SEARCH_ILLUSTS = false     // 搜索插画
        settings.SHOW_ORIGINAL_LINK = true  // 目录处显示源链接，但会增加请求次数
        settings.DEBUG = false              // 调试模式
        java.log("⚙️ 使用默认设置（无自定义设置 或 自定义设置有误）")
    }
    u.CONVERT_CHINESE = settings.CONVERT_CHINESE
    u.SEARCH_ILLUSTS = settings.SEARCH_ILLUSTS
    u.SHOW_ORIGINAL_LINK = settings.SHOW_ORIGINAL_LINK
    u.DEBUG = settings.DEBUG

    if (u.DEBUG === true) {
        java.log(JSON.stringify(settings, null, 4))
        java.log(`DEBUG = ${u.DEBUG}`)
    }
    u.debugFunc = (func) => {
        if (util.DEBUG) {
            func()
        }
    }

    u.isLogin = function() {
        return getFromCache("csfrToken") !== null
    }

    u.login = function() {
        let resp = java.startBrowserAwait(`https://accounts.pixiv.net/login,
    {"headers": {"User-Agent": "${java.getWebViewUA()}"}}`, '登录账号', false)
        if (resp.code() === 200) {
            this.getCookie(); this.getCsrfToken()
        } else {
            java.log(resp.code()); sleepToast("⚠️ 登录失败")
        }
    }

    u.logout = function() {
        this.removeCookie()
        java.startBrowser("https://www.pixiv.net/logout.php", "退出账号")
        this.removeCookie()
        sleepToast(`✅ 已退出当前账号\n\n退出后请点击右上角的 ✔️ 退出\n\n登录请点击【登录账号】进行登录`)
    }

    u.getCookie = function() {
        let pixivCookie = String(java.getCookie("https://www.pixiv.net/", null))
        if (pixivCookie.includes("first_visit_datetime")) {
            // java.log(pixivCookie)
            cache.put("pixivCookie", pixivCookie, 60*60)
            return pixivCookie
        }
    }

    u.removeCookie = function() {
        cookie.removeCookie('https://www.pixiv.net')
        cookie.removeCookie('https://accounts.pixiv.net')
        cookie.removeCookie('https://accounts.google.com')
        cookie.removeCookie('https://api.weibo.com')
        cache.delete("pixivCookie")
        cache.delete("csfrToken")  // 与登录设备有关
        cache.delete("headers")
    }

    // 获取 Csrf Token，以便进行收藏等请求
    // 获取方法来自脚本 Pixiv Previewer
    // https://github.com/Ocrosoft/PixivPreviewer
    // https://greasyfork.org/zh-CN/scripts/30766-pixiv-previewer/code
    u.getCsrfToken = function() {
        let csfrToken
        let html = java.webView(null, "https://www.pixiv.net/", null)
        try {
            csfrToken = JSON.stringify(html.match(/token\\":\\"([a-z0-9]{32})/)[1])
        } catch (e) {
            csfrToken = null
        }
        // java.log(csfrToken)
        cache.put("csfrToken", JSON.stringify(csfrToken))  // 与登录设备有关
        return csfrToken
    }

    // 将多个长篇小说解析为一本书
    u.combineNovels = function(novels) {
        return novels.filter(novel => {
            // 单本直接解析为一本书
            if (novel.seriesId === undefined || novel.seriesId === null) {
                return true
            }
            // 集合中没有该系列解析为一本书
            if (!seriesSet.has(novel.seriesId)) {
                seriesSet.add(novel.seriesId)
                return true
            }
            return false
        })
    }

    u.handIllusts = function (illusts) {
        illusts.forEach(illust => {
            // illust.id = illust.id
            // illust.title = illust.title
            // illust.userName = illust.userName
            // illust.tags = illust.tags
            if (!(illust.tags instanceof Array)) {
                illust.tags = illust.tags.tags.map(item => item.tag)
                illust.coverUrl = illust.url = illust.urls.regular  // 兼容正文搜索
                illust.updateDate = illust.uploadDate
            }
            illust.textCount = null
            // illust.pageCount = illust.pageCount
            // illust.description = illust.description
            illust.coverUrl = illust.url
            illust.detailedUrl = urlIllustDetailed(illust.id)
            // illust.createDate = illust.createDate
            // illust.updateDate = illust.updateDate
            // illust.aiType = illust.aiType

            if (illust.seriesNavData === undefined || illust.seriesNavData === null) {
                illust.latestChapter = illust.title
            } else {
                illust.seriesId = illust.seriesNavData.seriesId
                illust.title = illust.seriesNavData.title
            }

            if (illust.seriesId !== undefined) {
                let resp = getAjaxJson(urlSeriesDetailed(illust.seriesId)).body
                let series = resp.illustSeries.filter(item => item.id === illust.seriesId)[0]
                // illust.title = illust.title
                illust.tags = illust.tags.concat(series.tags)
                illust.latestChapter = resp.thumbnails.illust.filter(item => item.id === series.latestIllustId)[0].title
                illust.description = series.description
                if (series.url === undefined) {
                    let firstChapter = getAjaxJson(urlIllustDetailed(series.firstIllustId)).body
                    illust.coverUrl = firstChapter.urls.regular
                    illust.tags = illust.tags.concat(firstChapter.tags.tags.map(item => item.tag))
                }
                illust.createDate = series.createDate
                illust.updateDate = series.updateDate
                illust.total = series.total
            }
        })
        return illusts
    }

    u.formatIllusts = function (illusts) {
        illusts.forEach(illust => {
            illust.title = illust.title.replace(RegExp(/^\s+|\s+$/g), "")
            illust.tags = Array.from(new Set(illust.tags))
            illust.tags = illust.tags.join(",")
            illust.coverUrl = urlCoverUrl(illust.coverUrl)
            illust.createDate = dateFormat(illust.createDate)
            illust.updateDate = dateFormat(illust.updateDate)
            if (util.MORE_INFORMATION) {
                illust.description = `\n书名：${illust.title}\n作者：${illust.userName}\n标签：${illust.tags}\n页面：${illust.pageCount}\n上传：${illust.createDate}\n更新：${illust.updateDate}\n简介：${illust.description}`
            } else {
                illust.description = `\n${illust.title}，共${illust.pageCount}页\n${illust.description}\n上传时间：${illust.createDate}\n更新时间：${illust.updateDate}`
            }
        })
        return illusts
    }

    u.getIllustRes = function (result) {
        let illustId = 0, res = {}
        let isJson = isJsonString(result)
        let isHtml = result.startsWith("<!DOCTYPE html>")
        if (!isJson && isHtml) {
            let pattern1 = "(https?://)?(www\\.)?pixiv\\.net/(artworks|ajax/illust)/(\\d+)"
            let isIllust = baseUrl.match(new RegExp(pattern1))
            let pattern2 = "(https?://)?(www\\.)?pixiv\\.net/(user/\\d+|ajax)/series/(\\d+)"
            let isSeries = baseUrl.match(new RegExp(pattern2))

            if (isIllust) {
                illustId = isIllust[4]
            } else if (isSeries) {
                seriesId = isSeries[4]
                java.log(`匹配系列ID：${seriesId}`)
                illustId = getAjaxJson(urlSeriesDetailed(seriesId)).body.page.series.reverse()[0].workId
            }
        }
        if (isJson) {
            res = JSON.parse(result)
        }

        if (illustId) {
            java.log(`匹配插画ID：${illustId}`)
            res = getAjaxJson(urlIllustDetailed(illustId))
        }
        if (res.error) {
            java.log(`无法从 Pixiv 获取当前漫画`)
            java.log(JSON.stringify(res))
            return []
        }
        return res.body
    }

    util = u
    java.put("util", objStringify(u))
}

// 获取请求的user id方便其他ajax请求构造
function getPixivUid() {
    let uid = java.getResponse().headers().get("x-userid")
    if (uid != null) {
        cache.put("pixiv:uid", String(uid))
    }
}

function getBlockAuthorsFromSource() {
    let authors = []
    try {
        authors = JSON.parse(`[${source.getVariable()}]`)
        // sleepToast(JSON.stringify(authors))
    } catch (e) {
        sleepToast("🚫 屏蔽作者\n⚠️ 【书源】源变量设置有误\n输入作者ID，以英文逗号间隔，保存")
    }
    return authors
}

function syncBlockAuthorList() {
    let authors1 = getFromCache("blockAuthorList")
    let authors2 = getBlockAuthorsFromSource()
    if (authors1 === null) {
        cache.put("blockAuthorList", JSON.stringify(authors2))
    } else if (authors1.length > authors2.length) {
        cache.put("blockAuthorList", JSON.stringify(authors2))
        java.log("屏蔽作者：已将源变量同步至内存")
    }
}

publicFunc(); syncBlockAuthorList()
if (result.code() === 200) {
    getPixivUid(); util.getCookie()
}
util.debugFunc(() => {
    java.log(`DEBUG = ${util.settings.DEBUG}\n`)
    java.log(JSON.stringify(util.settings, null, 4))
    java.log(`${java.getUserAgent()}\n`)
    java.log(`${cache.get("csfrToken")}\n`)
    java.log(`${cache.get("pixivCookie")}\n`)
})
java.getStrResponse(null, null)