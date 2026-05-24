z# Bed of Roses — Public API Registry

## Purpose

This document is the AI companion's reference for available free and public APIs. When a user requests functionality that requires external data, the AI should consult this registry to determine which API to call, what authentication is needed, and how to integrate it into a widget.

## How to Use This Document

1. When a user makes a request, identify the **category** of data needed.
2. Look up available APIs in that category below.
3. Prefer APIs marked `No` under Auth (no API key required) for instant use.
4. APIs marked `apiKey` require the user to have configured a key in OS settings.
5. APIs marked `OAuth` require full OAuth flow — use only when the user has set up the integration.
6. Always check the CORS column — `Yes` means the widget can call it directly from the browser; `No` or `Unknown` means route through the System Bridge proxy.
7. Always prefer HTTPS APIs (`Yes` in HTTPS column).

## Auth Legend

- `No` = No authentication needed. Use immediately.
- `apiKey` = Requires an API key. Check if user has configured one in settings.
- `OAuth` = Requires OAuth authentication flow.
- `X-Mashape-Key` = Requires RapidAPI key.

---

## Animals

Use for: pet adoption searches, animal facts, animal images, wildlife data.

| API | Description | Auth | HTTPS | CORS | Docs |
|-----|-------------|------|-------|------|------|
| AdoptAPet | Resource to help get pets adopted | apiKey | Yes | Yes | https://www.adoptapet.com/public/apis/pet_list.html |
| Axolotl | Collection of axolotl pictures and facts | No | Yes | No | https://theaxolotlapi.netlify.app/ |
| Cat Facts | Daily cat facts | No | Yes | No | https://alexwohlbruck.github.io/cat-facts/ |
| Cataas | Cat as a service (cats pictures and gifs) | No | Yes | No | https://cataas.com/ |
| Cats | Pictures of cats from Tumblr | apiKey | Yes | No | https://docs.thecatapi.com/ |
| Dog Facts | Random dog facts | No | Yes | Yes | https://dukengn.github.io/Dog-facts-API/ |
| Dogs | Based on the Stanford Dogs Dataset | No | Yes | Yes | https://dog.ceo/dog-api/ |
| eBird | Retrieve recent or notable birding observations within a region | apiKey | Yes | No | https://documenter.getpostman.com/view/664302/S1ENwy59 |
| FishWatch | Information and pictures about individual fish species | No | Yes | Yes | https://www.fishwatch.gov/developers |
| HTTP Cat | Cat for every HTTP Status | No | Yes | Yes | https://http.cat/ |
| HTTP Dog | Dogs for every HTTP response status code | No | Yes | Yes | https://http.dog/ |
| IUCN | IUCN Red List of Threatened Species | apiKey | No | No | http://apiv3.iucnredlist.org/api/v3/docs |
| MeowFacts | Get random cat facts | No | Yes | No | https://github.com/wh-iterabb-it/meowfacts |
| Petfinder | Petfinder helps pets find homes | apiKey | Yes | Yes | https://www.petfinder.com/developers/ |
| PlaceBear | Placeholder bear pictures | No | Yes | Yes | https://placebear.com/ |
| PlaceDog | Placeholder Dog pictures | No | Yes | Yes | https://place.dog |
| PlaceKitten | Placeholder Kitten pictures | No | Yes | Yes | https://placekitten.com/ |
| RandomDog | Random pictures of dogs | No | Yes | Yes | https://random.dog/woof.json |
| RandomDuck | Random pictures of ducks | No | Yes | No | https://random-d.uk/api |
| RandomFox | Random pictures of foxes | No | Yes | No | https://randomfox.ca/floof/ |
| Shibe.Online | Random pictures of Shiba Inu, cats or birds | No | Yes | Yes | http://shibe.online/ |
| The Dog | A public service all about Dogs | apiKey | Yes | No | https://thedogapi.com/ |
| xeno-canto | Bird recordings | No | Yes | Unknown | https://xeno-canto.org/explore/api |
| Zoo Animals | Facts and pictures of zoo animals | No | Yes | Yes | https://zoo-animal-api.herokuapp.com/ |

---

## Anime

Use for: anime discovery, anime quotes, manga data, anime tracking.

| API | Description | Auth | HTTPS | CORS | Docs |
|-----|-------------|------|-------|------|------|
| AniAPI | Anime discovery, streaming & syncing with trackers | OAuth | Yes | Yes | https://aniapi.com/docs/ |
| AniDB | Anime Database | apiKey | No | Unknown | https://wiki.anidb.net/HTTP_API_Definition |
| AniList | Anime discovery & tracking | OAuth | Yes | Unknown | https://github.com/AniList/ApiV2-GraphQL-Docs |
| AnimeChan | Anime quotes (over 10k+) | No | Yes | No | https://github.com/RocktimSaikia/anime-chan |
| AnimeFacts | Anime Facts (over 100+) | No | Yes | Yes | https://chandan-02.github.io/anime-facts-rest-api/ |
| AnimeNewsNetwork | Anime industry news | No | Yes | Yes | https://www.animenewsnetwork.com/encyclopedia/api.php |
| Catboy | Neko images, funny GIFs & more | No | Yes | Yes | https://catboys.com/api |
| Danbooru Anime | Thousands of anime artist database | apiKey | Yes | Yes | https://danbooru.donmai.us/wiki_pages/help:api |
| Jikan | Unofficial MyAnimeList API | No | Yes | Yes | https://jikan.moe |
| Kitsu | Anime discovery platform | OAuth | Yes | Yes | https://kitsu.docs.apiary.io/ |
| MangaDex | Manga Database and Community | apiKey | Yes | Unknown | https://api.mangadex.org/docs.html |
| MyAnimeList | Anime and Manga Database and Community | OAuth | Yes | Unknown | https://myanimelist.net/clubs.php?cid=13727 |
| NekosBest | Neko Images & Anime roleplaying GIFs | No | Yes | Yes | https://docs.nekos.best |
| Shikimori | Anime discovery, tracking, forum, rates | OAuth | Yes | Unknown | https://shikimori.one/api/doc |
| Studio Ghibli | Resources from Studio Ghibli films | No | Yes | Yes | https://ghibliapi.herokuapp.com |
| Trace Moe | Get exact scene of anime from screenshot | No | Yes | No | https://soruly.github.io/trace.moe-api/ |
| Waifu.im | Waifu pictures from archive of over 4000 images | No | Yes | Yes | https://waifu.im/docs |
| Waifu.pics | Image sharing platform for anime images | No | Yes | No | https://waifu.pics/docs |

---

## Anti-Malware

Use for: security scanning, URL reputation checks, malware analysis, phishing detection.

| API | Description | Auth | HTTPS | CORS | Docs |
|-----|-------------|------|-------|------|------|
| AbuseIPDB | IP/domain/URL reputation | apiKey | Yes | Unknown | https://docs.abuseipdb.com/ |
| AlienVault OTX | IP/domain/URL reputation | apiKey | Yes | Unknown | https://otx.alienvault.com/api |
| Google Safe Browsing | Google Link/Domain Flagging | apiKey | Yes | Unknown | https://developers.google.com/safe-browsing/ |
| MalwareBazaar | Collect and share malware samples | apiKey | Yes | Unknown | https://bazaar.abuse.ch/api/ |
| URLhaus | Bulk queries and Download Malware Samples | No | Yes | Yes | https://urlhaus-api.abuse.ch/ |
| URLScan.io | Scan and Analyse URLs | apiKey | Yes | Unknown | https://urlscan.io/about-api/ |
| VirusTotal | VirusTotal File/URL Analysis | apiKey | Yes | Unknown | https://www.virustotal.com/en/documentation/public-api/ |

---

## Art & Design

Use for: color palettes, icons, museum data, design resources, emoji data.

| API | Description | Auth | HTTPS | CORS | Docs |
|-----|-------------|------|-------|------|------|
| Art Institute of Chicago | Art | No | Yes | Yes | https://api.artic.edu/docs/ |
| Colormind | Color scheme generator | No | No | Unknown | http://colormind.io/api-access/ |
| ColourLovers | Get various patterns, palettes and images | No | No | Unknown | http://www.colourlovers.com/api |
| Cooper Hewitt | Smithsonian Design Museum | apiKey | Yes | Unknown | https://collection.cooperhewitt.org/api |
| EmojiHub | Get emojis by categories and groups | No | Yes | Yes | https://github.com/cheatsnake/emojihub |
| Icon Horse | Favicons for any website, with fallbacks | No | Yes | Yes | https://icon.horse |
| Icons8 | Icons | No | Yes | Unknown | https://img.icons8.com/ |
| Lordicon | Icons with predone Animations | No | Yes | Yes | https://lordicon.com/ |
| Metropolitan Museum of Art | Met Museum of Art | No | Yes | No | https://metmuseum.github.io/ |
| PHP-Noise | Noise Background Image Generator | No | Yes | Yes | https://php-noise.com/ |
| Pixel Encounter | SVG Icon Generator | No | Yes | No | https://pixelencounter.com/api |
| Rijksmuseum | RijksMuseum Data | apiKey | Yes | Unknown | https://data.rijksmuseum.nl/object-metadata/api/ |
| xColors | Generate & convert colors | No | Yes | Yes | https://x-colors.herokuapp.com/ |

---

## Authentication & Authorization

Use for: user authentication, OTP, passwordless login.

| API | Description | Auth | HTTPS | CORS | Docs |
|-----|-------------|------|-------|------|------|
| Auth0 | Easy to implement authentication platform | apiKey | Yes | Yes | https://auth0.com |
| GetOTP | Implement OTP flow quickly | apiKey | Yes | No | https://otp.dev/en/docs/ |
| MojoAuth | Passwordless authentication platform | apiKey | Yes | Yes | https://mojoauth.com |
| Stytch | User infrastructure for modern applications | apiKey | Yes | No | https://stytch.com/ |
| Warrant | APIs for authorization and access control | apiKey | Yes | Yes | https://warrant.dev/ |

---

## Blockchain

Use for: blockchain data, smart contracts, crypto network stats, NFTs.

| API | Description | Auth | HTTPS | CORS | Docs |
|-----|-------------|------|-------|------|------|
| Bitquery | Onchain GraphQL APIs & DEX APIs | apiKey | Yes | Yes | https://graphql.bitquery.io/ide |
| Chainlink | Build hybrid smart contracts | No | Yes | Unknown | https://chain.link/developer-resources |
| Covalent | Multi-blockchain data aggregator | apiKey | Yes | Unknown | https://www.covalenthq.com/docs/api/ |
| Etherscan | Ethereum explorer API | apiKey | Yes | Yes | https://etherscan.io/apis |
| The Graph | Indexing protocol for querying networks | apiKey | Yes | Unknown | https://thegraph.com |

---

## Books

Use for: book search, reading recommendations, poetry, religious texts, library data.

| API | Description | Auth | HTTPS | CORS | Docs |
|-----|-------------|------|-------|------|------|
| Bible-api | Free Bible API with multiple languages | No | Yes | Yes | https://bible-api.com/ |
| Crossref Metadata Search | Books & Articles Metadata | No | Yes | Unknown | https://github.com/CrossRef/rest-api-doc |
| Google Books | Books | OAuth | Yes | Unknown | https://developers.google.com/books/ |
| Gutendex | Web-API for Project Gutenberg Books Library | No | Yes | Unknown | https://gutendex.com/ |
| Open Library | Books, book covers and related data | No | Yes | No | https://openlibrary.org/developers/api |
| PoetryDB | Instant data from vast poetry collection | No | Yes | Yes | https://github.com/thundercomb/poetrydb |
| Quran Cloud | RESTful Quran API | No | Yes | Yes | https://alquran.cloud/api |
| Wizard World | Harry Potter universe information | No | Yes | Yes | https://wizard-world-api.herokuapp.com/swagger/index.html |

---

## Business

Use for: company data, logos, freelancing, email marketing, project management.

| API | Description | Auth | HTTPS | CORS | Docs |
|-----|-------------|------|-------|------|------|
| Clearbit Logo | Search for company logos | apiKey | Yes | Unknown | https://clearbit.com/docs#logo-api |
| Domainsdb.info | Registered Domain Names Search | No | Yes | No | https://domainsdb.info/ |
| Gmail | RESTful access to inbox | OAuth | Yes | Unknown | https://developers.google.com/gmail/api/ |
| Google Analytics | Collect, configure and analyze data | OAuth | Yes | Unknown | https://developers.google.com/analytics/ |
| Mailchimp | Send marketing campaigns | apiKey | Yes | Unknown | https://mailchimp.com/developer/ |
| Trello | Boards, lists and cards for project management | OAuth | Yes | Unknown | https://developers.trello.com/ |

---

## Calendar

Use for: holidays, namedays, liturgical calendars, bank holidays.

| API | Description | Auth | HTTPS | CORS | Docs |
|-----|-------------|------|-------|------|------|
| Calendarific | Worldwide Holidays | apiKey | Yes | Unknown | https://calendarific.com/ |
| Google Calendar | Display, create and modify calendar events | OAuth | Yes | Unknown | https://developers.google.com/google-apps/calendar/ |
| Nager.Date | Public holidays for more than 90 countries | No | Yes | No | https://date.nager.at |
| Namedays Calendar | Provides namedays for multiple countries | No | Yes | Yes | https://nameday.abalin.net |
| UK Bank Holidays | Bank holidays in England, Wales, Scotland, Northern Ireland | No | Yes | Unknown | https://www.gov.uk/bank-holidays.json |
| Abstract Public Holidays | National, regional, religious holidays via API | apiKey | Yes | Yes | https://www.abstractapi.com/holidays-api |

---

## Cloud Storage & File Sharing

Use for: file uploads, sharing, temporary storage, IPFS pinning.

| API | Description | Auth | HTTPS | CORS | Docs |
|-----|-------------|------|-------|------|------|
| Box | File Sharing and Storage | OAuth | Yes | Unknown | https://developer.box.com/ |
| Dropbox | File Sharing and Storage | OAuth | Yes | Unknown | https://www.dropbox.com/developers |
| File.io | Super simple file sharing, anonymous and secure | No | Yes | Unknown | https://www.file.io |
| GoFile | Unlimited size file uploads for free | apiKey | Yes | Unknown | https://gofile.io/api |
| Google Drive | File Sharing and Storage | OAuth | Yes | Unknown | https://developers.google.com/drive/ |
| Imgbb | Simple and quick private image sharing | apiKey | Yes | Unknown | https://api.imgbb.com/ |
| Pantry | Free JSON storage for small projects | No | Yes | Yes | https://getpantry.cloud/ |
| Pastebin | Plain Text Storage | apiKey | Yes | Unknown | https://pastebin.com/doc_api |
| The Null Pointer | No-bullshit file hosting and URL shortening | No | Yes | Unknown | https://0x0.st |

---

## Cryptocurrency

Use for: crypto prices, exchange data, DeFi stats, wallet info, NFTs.

| API | Description | Auth | HTTPS | CORS | Docs |
|-----|-------------|------|-------|------|------|
| Binance | Exchange for Trading Cryptocurrencies | apiKey | Yes | Unknown | https://github.com/binance/binance-spot-api-docs |
| CoinCap | Real time Cryptocurrency prices via RESTful API | No | Yes | Unknown | https://docs.coincap.io/ |
| CoinDesk | CoinDesk's Bitcoin Price Index (BPI) in multiple currencies | No | Yes | Unknown | https://old.coindesk.com/coindesk-api/ |
| CoinGecko | Cryptocurrency Price, Market, and Developer/Social Data | No | Yes | Yes | http://www.coingecko.com/api |
| Coinlore | Cryptocurrencies prices, volume and more | No | Yes | Unknown | https://www.coinlore.com/cryptocurrency-data-api |
| CoinMarketCap | Cryptocurrencies Prices | apiKey | Yes | Unknown | https://coinmarketcap.com/api/ |
| Coinpaprika | Cryptocurrencies prices, volume and more | No | Yes | Yes | https://api.coinpaprika.com |
| CoinStats | Crypto Tracker | No | Yes | Unknown | https://documenter.getpostman.com/view/5734027/RzZ6Hzr3 |
| CryptoCompare | Cryptocurrencies Comparison | No | Yes | Unknown | https://www.cryptocompare.com/api |
| Gemini | Cryptocurrencies Exchange | No | Yes | Unknown | https://docs.gemini.com/rest-api/ |
| Kraken | Cryptocurrencies Exchange | apiKey | Yes | Unknown | https://docs.kraken.com/rest/ |
| Mempool | Bitcoin API focusing on transaction fee | No | Yes | No | https://mempool.space/api |
| Messari | API endpoints for thousands of crypto assets | No | Yes | Unknown | https://messari.io/api |

---

## Currency Exchange

Use for: exchange rates, currency conversion, forex data.

| API | Description | Auth | HTTPS | CORS | Docs |
|-----|-------------|------|-------|------|------|
| Currency-api | Free Currency Exchange Rates, 150+ Currencies, No Rate Limits | No | Yes | Yes | https://github.com/fawazahmed0/currency-api |
| ExchangeRate-API | Free currency conversion | apiKey | Yes | Yes | https://www.exchangerate-api.com |
| Frankfurter | Exchange rates, currency conversion and time series | No | Yes | Yes | https://www.frankfurter.app/docs |
| FreeForexAPI | Real-time foreign exchange rates for major currency pairs | No | Yes | No | https://freeforexapi.com/Home/Api |
| National Bank of Poland | Currency exchange rates (XML and JSON) | No | Yes | Yes | http://api.nbp.pl/en.html |
| VATComply.com | Exchange rates, geolocation and VAT validation | No | Yes | Yes | https://www.vatcomply.com/documentation |
| Exchangerate.host | Free foreign exchange & crypto rates | No | Yes | Unknown | https://exchangerate.host |

---

## Data Validation

Use for: address validation, content filtering, profanity checks.

| API | Description | Auth | HTTPS | CORS | Docs |
|-----|-------------|------|-------|------|------|
| PurgoMalum | Content validator against profanity & obscenity | No | No | Unknown | http://www.purgomalum.com |
| Postman Echo | Test API server to receive and return values | No | Yes | Unknown | https://www.postman-echo.com |

---

## Development

Use for: developer tools, code compilation, screenshots, QR codes, IP lookup, random data, scraping.

| API | Description | Auth | HTTPS | CORS | Docs |
|-----|-------------|------|-------|------|------|
| Agify.io | Estimates age from a first name | No | Yes | Yes | https://agify.io |
| Bored | Find random activities to fight boredom | No | Yes | Unknown | https://www.boredapi.com/ |
| CDNJS | Library info on CDNJS | No | Yes | Unknown | https://api.cdnjs.com/libraries/jquery |
| Codex | Online Compiler for Various Languages | No | Yes | Unknown | https://github.com/Jaagrav/CodeX |
| CountAPI | Free and simple counting service | No | Yes | Yes | https://countapi.xyz |
| Genderize.io | Estimates gender from first name | No | Yes | Yes | https://genderize.io |
| GitHub | Make use of GitHub repos, code and user info | OAuth | Yes | Yes | https://docs.github.com/en/rest |
| Google Fonts | Metadata for all families served by Google Fonts | apiKey | Yes | Unknown | https://developers.google.com/fonts/docs/developer_api |
| Httpbin | Simple HTTP Request & Response Service | No | Yes | Yes | https://httpbin.org/ |
| Icanhazip | IP Address API | No | Yes | Yes | https://major.io/icanhazip-com-faq/ |
| IPify | A simple IP Address API | No | Yes | Unknown | https://www.ipify.org/ |
| IPinfo | Simple IP Address API | No | Yes | Unknown | https://ipinfo.io/developers |
| JSONbin.io | Free JSON storage service | apiKey | Yes | Yes | https://jsonbin.io |
| JSONPlaceholder | Fake REST API for testing and prototyping | No | Yes | Yes | https://jsonplaceholder.typicode.com |
| Kroki | Creates diagrams from textual descriptions | No | Yes | Yes | https://kroki.io |
| Nationalize.io | Estimate nationality of a first name | No | Yes | Yes | https://nationalize.io |
| npm Registry | Query info about Node.js libraries | No | Yes | Unknown | https://github.com/npm/registry |
| QR code | Create QR code and URL shortener | No | Yes | Yes | https://www.qrtag.net/api/ |
| Qrcode Monkey | Integrate custom QR codes | No | Yes | Unknown | https://www.qrcode-monkey.com/qr-code-api-with-logo/ |
| QuickChart | Generate chart and graph images | No | Yes | Yes | https://quickchart.io/ |
| ReqRes | Hosted REST-API ready to respond to AJAX requests | No | Yes | Unknown | https://reqres.in/ |
| RSS feed to JSON | Returns RSS feed in JSON format | No | Yes | Yes | https://rss-to-json-serverless-api.vercel.app |
| StackExchange | Q&A forum for developers | OAuth | Yes | Unknown | https://api.stackexchange.com/ |

---

## Dictionaries

Use for: word definitions, synonyms, antonyms, pronunciations, translations.

| API | Description | Auth | HTTPS | CORS | Docs |
|-----|-------------|------|-------|------|------|
| Free Dictionary | Definitions, phonetics, pronunciations, examples, synonyms | No | Yes | Unknown | https://dictionaryapi.dev/ |
| Lingua Robot | Word definitions, pronunciations, synonyms, antonyms | apiKey | Yes | Yes | https://www.linguarobot.io |
| Merriam-Webster | Dictionary and Thesaurus Data | apiKey | Yes | Unknown | https://dictionaryapi.com/ |
| Wiktionary | Collaborative dictionary data | No | Yes | Yes | https://en.wiktionary.org/w/api.php |

---

## Documents & Productivity

Use for: file conversion, project management, time tracking, PDFs, note-taking.

| API | Description | Auth | HTTPS | CORS | Docs |
|-----|-------------|------|-------|------|------|
| Airtable | Integrate with Airtable | apiKey | Yes | Unknown | https://airtable.com/api |
| Asana | Programmatic access to Asana data | apiKey | Yes | Yes | https://developers.asana.com/docs |
| ClickUp | Cloud-based project management tool | OAuth | Yes | Unknown | https://clickup.com/api |
| Clockify | Time tracking REST API | apiKey | Yes | Unknown | https://clockify.me/developers-api |
| JIRA | Issue tracking and agile project management | OAuth | Yes | Unknown | https://developer.atlassian.com/server/jira/platform/rest-apis/ |
| Notion | Integrate with Notion | OAuth | Yes | Unknown | https://developers.notion.com/docs/getting-started |
| Todoist | Todo Lists | OAuth | Yes | Unknown | https://developer.todoist.com |
| WakaTime | Automated time tracking for programmers | No | Yes | Unknown | https://wakatime.com/developers |

---

## Email

Use for: email validation, disposable email detection, temporary emails, email sending.

| API | Description | Auth | HTTPS | CORS | Docs |
|-----|-------------|------|-------|------|------|
| Disify | Validate and detect disposable email addresses | No | Yes | Yes | https://www.disify.com/ |
| EVA | Validate email addresses | No | Yes | Yes | https://eva.pingutil.com/ |
| Guerrilla Mail | Disposable temporary Email addresses | No | Yes | Unknown | https://www.guerrillamail.com/GuerrillaMailAPI.html |
| Kickbox | Email verification API | No | Yes | Yes | https://open.kickbox.com/ |
| mail.gw | 10 Minute Mail | No | Yes | Yes | https://docs.mail.gw |
| mail.tm | Temporary Email Service | No | Yes | Yes | https://docs.mail.tm |
| MailCheck.ai | Prevent signups with temporary email addresses | No | Yes | Unknown | https://www.mailcheck.ai/#documentation |
| Sendgrid | Cloud-based SMTP provider | apiKey | Yes | Unknown | https://docs.sendgrid.com/api-reference/ |

---

## Entertainment

Use for: jokes, memes, random facts, fun content.

| API | Description | Auth | HTTPS | CORS | Docs |
|-----|-------------|------|-------|------|------|
| chucknorris.io | Chuck Norris jokes | No | Yes | Unknown | https://api.chucknorris.io |
| Corporate Buzz Words | Corporate Buzz Word generator | No | Yes | Yes | https://github.com/sameerkumar18/corporate-bs-generator-api |
| Fun Fact | Random fun facts | No | Yes | Yes | https://api.aakhilv.me |
| Imgflip | Popular memes array | No | Yes | Unknown | https://imgflip.com/api |
| Random Useless Facts | Useless but true facts | No | Yes | Unknown | https://uselessfacts.jsph.pl/ |

---

## Environment

Use for: air quality, carbon footprint, pollen, energy data, environmental monitoring.

| API | Description | Auth | HTTPS | CORS | Docs |
|-----|-------------|------|-------|------|------|
| Carbon Interface | Calculate carbon (CO2) emissions estimates | apiKey | Yes | Yes | https://docs.carboninterface.com/ |
| Climatiq | Calculate environmental footprint | apiKey | Yes | Yes | https://docs.climatiq.io |
| IQAir | Air quality and weather data | apiKey | Yes | Unknown | https://www.iqair.com/air-pollution-data-api |
| OpenAQ | Open air quality data | apiKey | Yes | Unknown | https://docs.openaq.org/ |
| UK Carbon Intensity | Carbon Intensity API for Great Britain | No | Yes | Unknown | https://carbon-intensity.github.io/api-definitions/ |

---

## Events

Use for: event discovery, tickets, venue information.

| API | Description | Auth | HTTPS | CORS | Docs |
|-----|-------------|------|-------|------|------|
| Eventbrite | Find events | OAuth | Yes | Unknown | https://www.eventbrite.com/platform/api/ |
| SeatGeek | Search events, venues and performers | apiKey | Yes | Unknown | https://platform.seatgeek.com/ |
| Ticketmaster | Search events, attractions, or venues | apiKey | Yes | Unknown | http://developer.ticketmaster.com/products-and-docs/apis/getting-started/ |

---

## Finance

Use for: stock prices, market data, budgeting, banking, payment processing.

| API | Description | Auth | HTTPS | CORS | Docs |
|-----|-------------|------|-------|------|------|
| Alpha Vantage | Realtime and historical stock data | apiKey | Yes | Unknown | https://www.alphavantage.co/ |
| Binlist | Public IIN/BIN information | No | Yes | Unknown | https://binlist.net/ |
| Econdb | Global macroeconomic data | No | Yes | Yes | https://www.econdb.com/api/ |
| Fed Treasury | U.S. Department of the Treasury Data | No | Yes | Unknown | https://fiscaldata.treasury.gov/api-documentation/ |
| Financial Modeling Prep | Realtime and historical stock data | apiKey | Yes | Unknown | https://site.financialmodelingprep.com/developer/docs |
| Finnhub | Real-Time RESTful APIs for Stocks, Currencies, Crypto | apiKey | Yes | Unknown | https://finnhub.io/docs/api |
| FRED | Economic data from Federal Reserve Bank of St. Louis | apiKey | Yes | Yes | https://fred.stlouisfed.org/docs/api/fred/ |
| IEX Cloud | Realtime & Historical Stock and Market Data | apiKey | Yes | Yes | https://iexcloud.io/docs/api/ |
| Indian Mutual Fund | Complete history of India Mutual Funds Data | No | Yes | Unknown | https://www.mfapi.in/ |
| Mono | Connect with bank accounts in Africa | apiKey | Yes | Unknown | https://mono.co/ |
| OpenFIGI | Equity, index, futures, options symbology | apiKey | Yes | Yes | https://www.openfigi.com/api |
| Portfolio Optimizer | Portfolio analysis and optimization | No | Yes | Yes | https://portfoliooptimizer.io/ |
| SEC EDGAR Data | Annual reports of public US companies | No | Yes | Yes | https://www.sec.gov/edgar/sec-api-documentation |
| Yahoo Finance | Stock market, crypto, currency exchange | apiKey | Yes | Yes | https://www.yahoofinanceapi.com/ |
| YNAB | Budgeting & Planning | OAuth | Yes | Yes | https://api.youneedabudget.com/ |

---

## Food & Drink

Use for: recipes, nutrition data, food images, brewery info, cocktails.

| API | Description | Auth | HTTPS | CORS | Docs |
|-----|-------------|------|-------|------|------|
| Coffee | Random pictures of coffee | No | Yes | Unknown | https://coffee.alexflipnote.dev/ |
| Edamam nutrition | Nutrition Analysis | apiKey | Yes | Unknown | https://developer.edamam.com/edamam-docs-nutrition-api |
| Edamam recipes | Recipe Search | apiKey | Yes | Unknown | https://developer.edamam.com/edamam-docs-recipe-api |
| Foodish | Random pictures of food dishes | No | Yes | Yes | https://github.com/surhud004/Foodish |
| Fruityvice | Data about all kinds of fruit | No | Yes | Unknown | https://www.fruityvice.com |
| Open Brewery DB | Breweries, Cideries and Craft Beer Bottle Shops | No | Yes | Yes | https://www.openbrewerydb.org |
| Open Food Facts | Food Products Database | No | Yes | Unknown | https://world.openfoodfacts.org/data |
| PunkAPI | Brewdog Beer Recipes | No | Yes | Unknown | https://punkapi.com/ |
| Spoonacular | Recipes, Food Products, Meal Planning | apiKey | Yes | Unknown | https://spoonacular.com/food-api |
| TheCocktailDB | Cocktail Recipes | apiKey | Yes | Yes | https://www.thecocktaildb.com/api.php |
| TheMealDB | Meal Recipes | apiKey | Yes | Yes | https://www.themealdb.com/api.php |

---

## Games & Comics

Use for: game data, game deals, trivia, comics, RPG info, game stats.

| API | Description | Auth | HTTPS | CORS | Docs |
|-----|-------------|------|-------|------|------|
| AmiiboAPI | Nintendo Amiibo Information | No | Yes | Yes | https://amiiboapi.com/ |
| Board Game Geek | Board games, RPG and videogames | No | Yes | No | https://boardgamegeek.com/wiki/page/BGG_XML_API2 |
| CheapShark | Steam/PC Game Prices and Deals | No | Yes | Yes | https://www.cheapshark.com/api |
| Chess.com | Chess.com read-only REST API | No | Yes | Unknown | https://www.chess.com/news/view/published-data-api |
| Comic Vine | Comics | No | Yes | Unknown | https://comicvine.gamespot.com/api/documentation |
| Deck of Cards | Deck of Cards | No | No | Unknown | http://deckofcardsapi.com/ |
| Disney | Information of Disney characters | No | Yes | Yes | https://disneyapi.dev |
| Dota 2 | Player stats, Match stats, Rankings | apiKey | Yes | Unknown | https://docs.opendota.com/ |
| Dungeons and Dragons | Reference for 5th edition spells, classes, monsters | No | No | No | https://www.dnd5eapi.co/docs/ |
| FreeToGame | Free-To-Play Games Database | No | Yes | Yes | https://www.freetogame.com/api-doc |
| FunTranslations | Translate Text into funny languages | No | Yes | Yes | https://api.funtranslations.com/ |
| GamerPower | Game Giveaways Tracker | No | Yes | Yes | https://www.gamerpower.com/api-read |
| Genshin Impact | Genshin Impact game data | No | Yes | Yes | https://genshin.dev |
| Giant Bomb | Video Games | apiKey | Yes | Unknown | https://www.giantbomb.com/api/documentation |
| Pokémon (GraphQL) | Pokemon API, Generations 1-8 | No | Yes | Yes | https://github.com/favware/graphql-pokemon |
| RAWG | Video Games Database with 500,000+ games | apiKey | Yes | Unknown | https://rawg.io/apidocs |

---

## Geocoding

Use for: address lookup, coordinates, geolocation, maps, timezone, postal codes.

| API | Description | Auth | HTTPS | CORS | Docs |
|-----|-------------|------|-------|------|------|
| Nominatim (OpenStreetMap) | Geocoding, reverse geocoding | No | Yes | Yes | https://nominatim.org/release-docs/develop/api/Overview/ |
| Open-Meteo Geocoding | Geocode city names to coordinates | No | Yes | Yes | https://open-meteo.com/en/docs/geocoding-api |
| ipapi.co | IP Geolocation | No | Yes | Yes | https://ipapi.co/ |
| ip-api | IP Geolocation (free for non-commercial) | No | No | Unknown | http://ip-api.com/docs |
| GeoJS | IP Geolocation with ChatOps integration | No | Yes | Yes | https://www.geojs.io |
| REST Countries | Country data (flag, currency, population, etc.) | No | Yes | Unknown | https://restcountries.com |
| Zippopotam.us | Postal codes and place info | No | No | Unknown | http://www.zippopotam.us |
| WorldTimeAPI | Timezone info | No | Yes | Yes | http://worldtimeapi.org |

---

## Government

Use for: government data, legislation, census, political data.

| API | Description | Auth | HTTPS | CORS | Docs |
|-----|-------------|------|-------|------|------|
| USA.gov | US Government Data and Services | apiKey | Yes | Unknown | https://www.usa.gov/developer |
| Federal Register | US Federal Rules and Regulations | No | Yes | Unknown | https://www.federalregister.gov/developers/documentation/api/v1 |
| Open Government (USA) | US Government Open Data | No | Yes | Unknown | https://www.data.gov/ |

---

## Health

Use for: health data, COVID stats, FDA data, nutritional info, exercise.

| API | Description | Auth | HTTPS | CORS | Docs |
|-----|-------------|------|-------|------|------|
| Open Disease | Disease data aggregation | No | Yes | Yes | https://disease.sh/docs/ |
| NPPES | US National Provider Identifier lookup | No | Yes | Unknown | https://npiregistry.cms.hhs.gov/registry/help-api |
| openFDA | FDA drug, device, food data | No | Yes | Unknown | https://open.fda.gov |

---

## Jobs

Use for: job listings, remote work, job search.

| API | Description | Auth | HTTPS | CORS | Docs |
|-----|-------------|------|-------|------|------|
| Adzuna | Job board aggregator | apiKey | Yes | Unknown | https://developer.adzuna.com |
| Arbeitnow | Job board aggregator for Germany | No | Yes | Yes | https://documenter.getpostman.com/view/18545278/UVsEVUsg |
| Remotive | Remote job listings | No | Yes | Unknown | https://remotive.io/api-documentation |

---

## Machine Learning

Use for: AI inference, NLP, image recognition, text generation.

| API | Description | Auth | HTTPS | CORS | Docs |
|-----|-------------|------|-------|------|------|
| Clarifai | Computer Vision | OAuth | Yes | Unknown | https://docs.clarifai.com |
| Deepcode | AI-powered code review | No | Yes | Unknown | https://www.deepcode.ai |
| Hugging Face | Access to NLP models | apiKey | Yes | Yes | https://huggingface.co/docs/api-inference |

---

## Music

Use for: song lyrics, music metadata, streaming, radio stations.

| API | Description | Auth | HTTPS | CORS | Docs |
|-----|-------------|------|-------|------|------|
| Deezer | Music | OAuth | Yes | Unknown | https://developers.deezer.com/api |
| Genius | Song lyrics and annotations | OAuth | Yes | Unknown | https://docs.genius.com |
| iTunes Search | Software products search | No | Yes | Unknown | https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/index.html |
| Jamendo | Music | OAuth | Yes | Unknown | https://developer.jamendo.com |
| Last.fm | Music | apiKey | Yes | Unknown | https://www.last.fm/api |
| ListenNotes | Podcast Search & Directory | apiKey | Yes | Unknown | https://www.listennotes.com/api/docs/ |
| MusicBrainz | Music metadata | No | Yes | Unknown | https://musicbrainz.org/doc/Development/XML_Web_Service/Version_2 |
| Spotify | Music streaming and metadata | OAuth | Yes | Unknown | https://developer.spotify.com/documentation/web-api |

---

## News

Use for: news articles, headlines, current events, media monitoring.

| API | Description | Auth | HTTPS | CORS | Docs |
|-----|-------------|------|-------|------|------|
| GNews | Search world news | apiKey | Yes | Yes | https://gnews.io/ |
| Hacker News | Social news for CS and entrepreneurship | No | Yes | Unknown | https://github.com/HackerNews/API |
| NewsAPI | Search world news articles | apiKey | Yes | Unknown | https://newsapi.org/ |
| New York Times | NYT APIs | apiKey | Yes | Unknown | https://developer.nytimes.com/ |
| Spaceflight News | Space related news | No | Yes | Unknown | https://spaceflightnewsapi.net |
| The Guardian | UK and world news | apiKey | Yes | Unknown | http://open-platform.theguardian.com/ |
| Wikipedia | MediaWiki Wikipedia API | No | Yes | Unknown | https://www.mediawiki.org/wiki/API:Main_page |

---

## Open Data

Use for: datasets, public data, statistics, research data.

| API | Description | Auth | HTTPS | CORS | Docs |
|-----|-------------|------|-------|------|------|
| Wikidata | Collaborative structured data knowledge base | No | Yes | Unknown | https://www.wikidata.org/wiki/Wikidata:Data_access |
| Wikipedia | Free encyclopedia content | No | Yes | Unknown | https://www.mediawiki.org/wiki/API:Main_page |
| Open Trivia | Trivia Questions Database | No | Yes | Unknown | https://opentdb.com/api_config.php |

---

## Photography

Use for: stock photos, image placeholders, random images.

| API | Description | Auth | HTTPS | CORS | Docs |
|-----|-------------|------|-------|------|------|
| Lorem Picsum | Random placeholder images | No | Yes | Unknown | https://picsum.photos |
| Pexels | Free stock photos and videos | apiKey | Yes | Yes | https://www.pexels.com/api/documentation/ |
| Pixabay | Free stock photos | apiKey | Yes | Unknown | https://pixabay.com/api/docs/ |
| Unsplash | High-quality free images | OAuth | Yes | Unknown | https://unsplash.com/developers |
| PlaceHolder | Custom placeholder images | No | Yes | Unknown | https://placeholder.com/ |

---

## Science & Math

Use for: NASA data, space, math formulas, scientific data, physics constants.

| API | Description | Auth | HTTPS | CORS | Docs |
|-----|-------------|------|-------|------|------|
| NASA | NASA open data (APOD, Mars Rover photos, etc.) | No | Yes | Unknown | https://api.nasa.gov |
| Numbers | Facts about numbers | No | No | No | http://numbersapi.com |
| SpaceX | SpaceX launch, rocket, capsule, and company data | No | Yes | Unknown | https://github.com/r-spacex/SpaceX-API |
| Sunrise Sunset | Sunrise and sunset times | No | Yes | Unknown | https://sunrise-sunset.org/api |
| USGS Earthquake | Real-time earthquake data | No | Yes | Unknown | https://earthquake.usgs.gov/fdsnws/event/1/ |
| Wolfram Alpha | Computational knowledge engine | apiKey | Yes | Unknown | https://products.wolframalpha.com/api/ |

---

## Social

Use for: social media integration, mentions, followers, posts.

| API | Description | Auth | HTTPS | CORS | Docs |
|-----|-------------|------|-------|------|------|
| Discord | Chat and communities | OAuth | Yes | Unknown | https://discord.com/developers/docs |
| Reddit | Social news aggregation | OAuth | Yes | Unknown | https://www.reddit.com/dev/api |
| Slack | Messaging for teams | OAuth | Yes | Unknown | https://api.slack.com/ |
| Telegram Bot | Bot API for Telegram | apiKey | Yes | Unknown | https://core.telegram.org/bots/api |
| Twitter (X) | Social networking | OAuth | Yes | Unknown | https://developer.twitter.com |

---

## Sports & Fitness

Use for: sports scores, team data, exercise tracking, player statistics.

| API | Description | Auth | HTTPS | CORS | Docs |
|-----|-------------|------|-------|------|------|
| API-FOOTBALL | Football/Soccer data | apiKey | Yes | Yes | https://www.api-football.com/documentation-v3 |
| balldontlie | Basketball stats | No | Yes | Unknown | https://www.balldontlie.io |
| ESPN | ESPN sports data (unofficial) | No | No | Unknown | http://www.espn.com/apis/devcenter/docs/ |
| NBA Stats | Unofficial NBA stats | No | Yes | Unknown | https://any-api.com/nba_api/ |
| TheSportsDB | Sports data and artwork | apiKey | Yes | Yes | https://www.thesportsdb.com/api.php |
| Wger | Workout manager with exercises and nutrition | apiKey | Yes | Unknown | https://wger.de/en/software/api |

---

## Transportation

Use for: flight data, transit, shipping, vehicle info.

| API | Description | Auth | HTTPS | CORS | Docs |
|-----|-------------|------|-------|------|------|
| AviationStack | Real-time flight status and aviation data | apiKey | Yes | Unknown | https://aviationstack.com/ |
| OpenSky Network | Flight tracking and aircraft position data | No | Yes | Unknown | https://openskynetwork.github.io/opensky-api/ |
| Transport for London | TfL transport data | apiKey | Yes | Unknown | https://api.tfl.gov.uk |

---

## URL Shorteners

Use for: shortening URLs, link management.

| API | Description | Auth | HTTPS | CORS | Docs |
|-----|-------------|------|-------|------|------|
| Bitly | URL shortener and link management | OAuth | Yes | Unknown | https://dev.bitly.com |
| CleanURI | URL shortener service | No | Yes | Yes | https://cleanuri.com/docs |
| Rebrandly | Custom URL shortener | apiKey | Yes | Unknown | https://developers.rebrandly.com |
| Short.io | URL shortener and link management | apiKey | Yes | Unknown | https://developers.short.io/docs |

---

## Vehicle

Use for: car data, VIN lookup, fuel prices, vehicle specs.

| API | Description | Auth | HTTPS | CORS | Docs |
|-----|-------------|------|-------|------|------|
| NHTSA | National Highway Traffic Safety car data | No | Yes | Unknown | https://vpic.nhtsa.dot.gov/api/ |
| Kelley Blue Book (unofficial) | Vehicle pricing data | No | Yes | Unknown | N/A |

---

## Video

Use for: movie/TV data, streaming info, video hosting.

| API | Description | Auth | HTTPS | CORS | Docs |
|-----|-------------|------|-------|------|------|
| OMDB | Movie and TV show data (Open Movie Database) | apiKey | Yes | Unknown | http://www.omdbapi.com |
| TMDB | The Movie Database — movies, TV, actors | apiKey | Yes | Unknown | https://www.themoviedb.org/documentation/api |
| Vimeo | Video hosting platform | OAuth | Yes | Unknown | https://developer.vimeo.com |
| YouTube | Video sharing platform | OAuth | Yes | Unknown | https://developers.google.com/youtube/ |

---

## Weather

Use for: current weather, forecasts, historical weather, alerts.

| API | Description | Auth | HTTPS | CORS | Docs |
|-----|-------------|------|-------|------|------|
| Open-Meteo | Free weather forecast API, no API key needed | No | Yes | Yes | https://open-meteo.com/en/docs |
| OpenWeatherMap | Current weather, forecasts, historical data | apiKey | Yes | Unknown | https://openweathermap.org/api |
| Visual Crossing | Weather data and forecasts | apiKey | Yes | Unknown | https://www.visualcrossing.com/resources/documentation/weather-api/timeline-weather-api/ |
| Weatherbit | Weather forecasts and historical data | apiKey | Yes | Unknown | https://www.weatherbit.io/api |
| wttr.in | Weather in plain-text, PNG, or JSON | No | Yes | Unknown | https://wttr.in/:help |

---

## Quick Reference: Best No-Auth APIs for Immediate Use

These APIs require NO authentication and can be used immediately without user configuration:

| Category | API | Use Case |
|----------|-----|----------|
| Weather | Open-Meteo | Weather widgets, forecasts |
| Weather | wttr.in | Simple weather lookups |
| Currency | Frankfurter | Exchange rates, conversion |
| Currency | Currency-api | 150+ currencies, no rate limits |
| News | Hacker News | Tech news feed |
| Books | Open Library | Book search and covers |
| Books | PoetryDB | Poetry collections |
| Food | TheMealDB (free tier) | Meal recipes |
| Food | TheCocktailDB (free tier) | Cocktail recipes |
| Food | Open Brewery DB | Brewery search |
| Fun | chucknorris.io | Jokes |
| Fun | Random Useless Facts | Random trivia |
| Fun | Bored API | Activity suggestions |
| Games | Deck of Cards | Card game logic |
| Games | FreeToGame | Free games database |
| Games | Disney | Disney character data |
| Dev | IPify | Get user's IP address |
| Dev | JSONPlaceholder | Mock data for testing |
| Dev | QR code | Generate QR codes |
| Dev | QuickChart | Generate chart images |
| Geo | Nominatim | Geocoding/reverse geocoding |
| Geo | REST Countries | Country info |
| Science | NASA APOD | Astronomy Picture of the Day |
| Science | USGS Earthquake | Earthquake data |
| Science | SpaceX | Launch data |
| Animals | Dogs | Random dog images |
| Animals | Cat Facts | Random cat facts |
| Calendar | Nager.Date | Public holidays worldwide |
| Calendar | UK Bank Holidays | UK holiday dates |
| Finance | Econdb | Macroeconomic data |
| Finance | SEC EDGAR | US public company reports |
| Dictionary | Free Dictionary | Word definitions |
| Holidays | Nager.Date | Public holidays 90+ countries |
| Trivia | Open Trivia DB | Trivia questions |
| Placeholder | Lorem Picsum | Random images |

---

## AI Companion Usage Notes

### Priority Order for API Selection
1. **No-Auth APIs first** — Can be used immediately without any user setup.
2. **apiKey APIs second** — Check if the user has configured the relevant key in OS settings.
3. **OAuth APIs last** — Only if the user has completed the full OAuth integration setup.

### Widget Generation Guidelines
- When generating a widget that calls an API, always include error handling for failed requests.
- Cache API responses in the widget's `state.json` to support offline viewing.
- Display a loading state while fetching data.
- Include a refresh button/mechanism in data-driven widgets.
- Show the last-updated timestamp on widgets that display live data.
- If an API requires an auth key the user hasn't configured, offer to create a widget that will activate once the key is provided.

### Rate Limiting Awareness
- Most free APIs have rate limits. Cache aggressively.
- Use the System Bridge proxy to add caching headers.
- For real-time data (stocks, weather), set reasonable refresh intervals (e.g., 15 min for weather, 1 min for stocks).
- Never poll an API in a tight loop from a widget.

### CORS Handling
- APIs with `CORS: Yes` can be called directly from widget iframes.
- APIs with `CORS: No` or `Unknown` MUST be routed through the System Bridge proxy to avoid browser CORS errors.
- The System Bridge endpoint for proxied API calls: `http://localhost:PORT/api/proxy?url=ENCODED_URL`

---

*Last Updated: May 2026*
*Source: https://github.com/public-apis/public-apis*
*This is a curated subset optimized for Bed of Roses AI companion usage.*
