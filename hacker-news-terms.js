const natural = require('natural');
const TfIdf = natural.TfIdf;
const fs = require('fs');
const { Builder, By, Key, until } = require('selenium-webdriver');

let titleDocs = [];
let commentDocs = [];
const ranks = {}

function timeout(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

const getTextRank = (tfidf, word) => {
    return new Promise((resolve, reject) => {
        
    });
}

const setupDriver = async () => {
    try {
        const driver = await new Builder().forBrowser('firefox').build();
        return driver;
    } catch (e) {
        console.log(e);
        return null;
    }
}

const getCommentsFromPage = async (driver, href) => {
    await driver.get(href);

    const commentsSelector = By.css(".comment");
    await driver.wait(until.elementLocated(commentsSelector, 10));
    const comments = await driver.findElements(commentsSelector);
    for (let comment of comments) {
        await driver.executeScript("return arguments[0].querySelector('.reply').remove();", comment);
        const commentText = await comment.getText() || null
        if (commentText) {
            commentDocs.push(commentText.trim().replace(/\n/g, " ").toLowerCase())
        }
    }
}

const getTermsPastWeek = async (driver, page) => {
    await driver.get(`https://hn.algolia.com/?dateRange=pastWeek&page=${page}&prefix=false&query=&sort=byPopularity&type=story`);

    const storyTitlesSelector = By.css(".SearchResults .Story .Story_title a:first-of-type");
    await driver.wait(until.elementLocated(storyTitlesSelector, 10));
    const storyTitles = await driver.findElements(storyTitlesSelector);
    
    console.log(storyTitles.length);
    if (storyTitles.length === 0) {
        return false;
    }
    let storyObjects = [];
    for (let storyTitle of storyTitles) {
        const titleText = await storyTitle.getText() || null;
        const titleHref = await storyTitle.getAttribute('href') || null;
        const newStory = {};
        if (titleText) {
            newStory['title'] = titleText
        }
        if (titleHref) {
            newStory['href'] = titleHref
        }
        storyObjects.push(newStory)
    }
    for (let storyObject of storyObjects) {
        if (storyObject['title']) {
            titleDocs.push(storyObject['title'].trim().toLowerCase());
        }
        if (storyObject['href']) {
            await getCommentsFromPage(driver, storyObject['href']);
        }
    }

    return true;
}

(async function() {
    const driver = await setupDriver();

    let page = 0;
    let response = true;
    // while (response && page < 25) {
        try {
            response = await getTermsPastWeek(driver, page);
        } catch(e) {
            console.log("getTermsPastWeek error:", e);
        }

    //     page += 1;
    // }
    

    console.log("titles count:", titleDocs.length);
    console.log("comments count:", commentDocs.length);
    const tfidf = new TfIdf();
    const allDocs = titleDocs.concat(commentDocs);
    for (let doc of allDocs) {
        tfidf.addDocument(doc);
    }

    console.log("ranking words")
    for (let [i, doc] of allDocs.entries()) {
        const isTitle = i < titleDocs.length;
        for (let word of doc.split(' ')) {
            word = word.trim().replace(/[^\w\s]/gi, '');
            if (word in ranks) {
                continue;
            }
            tfidf.tfidfs(word, function(i, measure) {
                if (measure) {
                    if (!ranks[i]) {
                        ranks[i] = {};
                        ranks[i][word] = measure
                    } else {
                        ranks[i][word] = measure;
                    }
                }
            });
        }
    }
    console.log('tfidf complete');
    const topWordsForEachDoc = Object.keys(ranks).map((measureIndex) => {
        return Object.keys(ranks[measureIndex]).sort((a, b) => {
            return ranks[measureIndex][b] - ranks[measureIndex][a];
        }).slice(0, 3);
    })
    let allTopWords = '';
    for (let topWordRow of topWordsForEachDoc) {
        allTopWords += topWordRow.join(' ') + " ";
    }
    console.log('got top words')
    allTopWords = allTopWords.trim().split(' ');
    
    const wordCounts = {};

    for (let word of allTopWords) {
        if (wordCounts[word]) {
            wordCounts[word] += 1;
        } else {
            wordCounts[word] = 1;
        }
    }

    const topWordsSorted = Object.keys(wordCounts).sort((a, b) => {
        return wordCounts[b] - wordCounts[a];
    }).map((word) => {
        return { word, count: wordCounts[word] }
    });
    console.log('top words counted');
    fs.writeFileSync('wordRanking.json', JSON.stringify(topWordsSorted, null, 4));

    console.log("done", topWordsSorted);

})();
