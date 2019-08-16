'use strict';

const cheerio = require("cheerio");
const request = require("request");
const Promise = require("bluebird");
const fs = require("fs");
const url = "https://www.bankmega.com/promolainnya.php";
const categoryPage = "https://www.bankmega.com/promolainnya.php?subcat={{id}}&page={{page}}"

const rv = {} // to save the result value
const categoryPageUrl = [] // save the all of category page url with pagination link
const promoUrl = [] // save the all promo item url

const writeFile = (data) => new Promise((resolve, reject) => {
    fs.writeFile("result.json", data, (err) => {
        if (err) {
            return reject(err);
        } else {
            return resolve(data);
        }
    });
});

const get = (url) => new Promise((resolve, reject) => {
    console.log(`getting ${url}`);

    request.get(url, function(
        error,
        response,
        data
    ) {
        if (error) {
            return reject(error);
        }

        try {
            console.log(`got response ${response.statusCode}`);

            const $ = cheerio.load(data);
            return resolve($)
        } catch (e) {
            return reject(e);
        }
    });
});

const getDetail = (category, url) => 
    get(url).then(($) => {
        const title = $(".titleinside > h3").text()
        const area = $(".area").text()
        const period = $(".periode").text()
        const image = $(".keteranganinside img").attr("src");
        var imageUrl = image

        if (image.match(/^\/files/g)) {
            imageUrl = `https://www.bankmega.com${image}`
        }

        const product = {
            "title": title,
            "area": area.replace("Area Promo : ", ""),
            "period": period.replace("Periode Promo : ", "").trim().replace(/\n/g, '').replace(/\t/g, ''),
            "imageUrl": imageUrl
        }

        rv[category].push(product)

        return rv;
    });

const getCategory = (id) => 
    get(categoryPage.replace("{{id}}", id).replace("{{page}}", 1)).then(($) => {
        const page = []
        $(".page_promo_lain").each((i, elem) => page.push($(elem).text()));
        page.pop(); // it's for remove `last page`
        page.shift(); // it`s for remove `first page`

        page.map(item => {
            categoryPageUrl.push(categoryPage.replace("{{id}}", id).replace("{{page}}", item))
        })
        
        return categoryPageUrl;

    }).catch( e => {
        throw e
    });

const getCategoryPage = (url) => get(url).then(($) => {
        $("#promolain > li > a").each((i, elem) => {
            const promoItem = $(elem);
            const promoItemHref = promoItem.attr("href");
            const catName = $("#subcatselected > img").attr("title")

            rv[catName] = []

            if (promoItemHref.match(/^promo_detail.php/g)) {
                promoUrl.push({
                    category: catName,
                    url: `https://www.bankmega.com/${promoItemHref}`
                })
            } else if (promoItemHref.match(/^https:\/\/bankmega.com/g)) {
                promoUrl.push({
                    category: catName,
                    url: promoItemHref
                })
            }

        });

        return promoUrl;

    });

const getSite = (url) => get(url).then(($) => {
    const catId = [];
    $('script').each((idx, elem) => {
        let text = $(elem.children).map((i, x) => x.data).filter((i, x) => x && x.match(/.*(subcat=)(\d)/)).get(0);
        
        if (text) {
            text.match(/.*(subcat=)(?<id>\d)/gm).map((elm, index) => catId.push(elm.replace(/.*subcat=/, "")));
        }
    });

    const categoryUrls = Promise.map(catId, (item) => getCategory(item), {concurrency: 100});

    return categoryUrls;
}).then(() => {
    return Promise.map(categoryPageUrl, (url) => getCategoryPage(url), {concurrency: 100})
}).then(() => {
    return Promise.map(promoUrl, ({category, url}) => getDetail(category, url), {concurrency: 100})
}).then(() => {
    writeFile(JSON.stringify(rv))
}).then(() => {
    console.log("done")
}).catch( e => {
    throw e;
})

getSite(url)
