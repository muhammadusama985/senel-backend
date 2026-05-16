const { Translate } = require("@google-cloud/translate").v2;
const Redis = require("ioredis");
const fs = require("fs");
const path = require("path");

const configuredApiKey =
  process.env.GOOGLE_TRANSLATE_API_KEY ||
  process.env.GOOGLE_API_KEY ||
  "";
const configuredCredentialPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const resolvedCredentialPath = configuredCredentialPath
  ? path.resolve(process.cwd(), configuredCredentialPath)
  : "";
const hasGoogleCredentials = Boolean(resolvedCredentialPath && fs.existsSync(resolvedCredentialPath));
let translateWarned = false;
const translate = configuredApiKey
  ? new Translate({ key: configuredApiKey })
  : hasGoogleCredentials
    ? new Translate({ keyFilename: resolvedCredentialPath })
    : null;

if (!configuredApiKey && configuredCredentialPath && !hasGoogleCredentials && !translateWarned) {
  console.warn(
    `Google Translate credentials file not found at ${resolvedCredentialPath}. Translation fallback is enabled.`
  );
  translateWarned = true;
}

const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  retryStrategy: () => null, // disable endless reconnect loops
});

let redisAvailable = false;
let redisWarned = false;

redis.on("ready", () => {
  redisAvailable = true;
});

redis.on("error", (error) => {
  redisAvailable = false;
  if (!redisWarned) {
    console.warn("Redis unavailable for translation cache:", error.message);
    redisWarned = true;
  }
});

async function ensureRedisConnected() {
  if (redisAvailable) return;
  try {
    await redis.connect();
    redisAvailable = true;
  } catch {
    redisAvailable = false;
  }
}

class TranslationService {
  constructor() {
    this.supportedLanguages = ["de", "tr", "fr", "es"];
    this.cacheTTL = 86400;
    this.nonTranslatableKeys = new Set([
      "_id",
      "id",
      "slug",
      "sku",
      "currency",
      "deepLink",
      "imageUrl",
      "imageUrlMobile",
      "coverImageUrl",
      "ctaUrl",
      "createdAt",
      "updatedAt",
      "publishedAt",
      "startAt",
      "endAt",
      "deletedAt",
      "orderNumber",
      "vendorOrderNumber",
      "paymentStatus",
      "shippingStatus",
      "status",
      "lang",
      "locale",
    ]);
  }

  _isPlainObject(value) {
    if (!value || typeof value !== "object") return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  }

  _isObjectIdLike(value) {
    return Boolean(
      value &&
      typeof value === "object" &&
      (value._bsontype === "ObjectId" ||
        value._bsontype === "ObjectID" ||
        value.constructor?.name === "ObjectId" ||
        value.constructor?.name === "ObjectID")
    );
  }

  _shouldPreserveString(key, value) {
    if (typeof value !== "string") return true;

    const trimmed = value.trim();
    if (!trimmed) return true;

    if (key) {
      if (this.nonTranslatableKeys.has(key)) return true;
      if (/id$/i.test(key)) return true;
      if (/(url|uri)$/i.test(key)) return true;
      if (/(date|time|at)$/i.test(key)) return true;
      if (/^(en|de|tr|fr|es)$/i.test(key) && trimmed.length <= 3) return true;
    }

    if (/^[a-f0-9]{24}$/i.test(trimmed)) return true;
    if (/^\d{4}-\d{2}-\d{2}t/i.test(trimmed)) return true;
    if (/^(https?:)?\/\//i.test(trimmed)) return true;
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return true;
    if (/^#?[0-9a-f]{6,8}$/i.test(trimmed)) return true;
    if (/^[A-Z]{2,10}$/.test(trimmed)) return true;

    return false;
  }

  _getCacheKey(text, targetLang) {
    if (!text || text.length < 5) return null;
    const hash = Buffer.from(text.substring(0, 100))
      .toString("base64")
      .replace(/[^a-zA-Z0-9]/g, "");
    return `trans:${targetLang}:${hash}`;
  }

  async _getFromCache(cacheKey) {
    if (!cacheKey) return null;
    await ensureRedisConnected();
    if (!redisAvailable) return null;
    try {
      const cached = await redis.get(cacheKey);
      if (!cached) return null;
      return JSON.parse(cached).translation || null;
    } catch {
      return null;
    }
  }

  async _setToCache(cacheKey, translation) {
    if (!cacheKey || !translation) return;
    await ensureRedisConnected();
    if (!redisAvailable) return;
    try {
      await redis.setex(
        cacheKey,
        this.cacheTTL,
        JSON.stringify({ translation, timestamp: new Date() })
      );
    } catch {
      // ignore cache write errors
    }
  }

  async translateText(text, targetLang) {
    if (!text || targetLang === "en" || !this.supportedLanguages.includes(targetLang)) {
      return text;
    }

    if (!translate) {
      return text;
    }

    try {
      const cacheKey = this._getCacheKey(text, targetLang);
      const cachedTranslation = await this._getFromCache(cacheKey);
      if (cachedTranslation) return cachedTranslation;

      const [translation] = await translate.translate(text, targetLang);
      await this._setToCache(cacheKey, translation);
      return translation || text;
    } catch (error) {
      console.error("Translation error:", error.message);
      return text;
    }
  }

  async translateObject(obj, targetLang, visited = new WeakSet()) {
    if (!obj || targetLang === "en" || typeof obj !== "object") {
      return obj;
    }

    if (obj instanceof Date || Buffer.isBuffer(obj) || obj instanceof Uint8Array) {
      return obj;
    }

    if (this._isObjectIdLike(obj)) {
      return obj.toString();
    }

    if (visited.has(obj)) return obj;
    visited.add(obj);

    if (Array.isArray(obj)) {
      const result = [];
      for (let i = 0; i < obj.length; i += 1) {
        result[i] = await this.translateObject(obj[i], targetLang, visited);
      }
      return result;
    }

    if (!this._isPlainObject(obj)) {
      return obj;
    }

    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === "string") {
        result[key] = this._shouldPreserveString(key, value)
          ? value
          : await this.translateText(value, targetLang);
      } else if (value && typeof value === "object") {
        result[key] = await this.translateObject(value, targetLang, visited);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  async translateResponse(data, targetLang) {
    if (!data || targetLang === "en") return data;

    if (data.items && Array.isArray(data.items)) {
      return { ...data, items: await this.translateObject(data.items, targetLang) };
    }

    if (data.product) {
      return { ...data, product: await this.translateObject(data.product, targetLang) };
    }

    if (data.categories && Array.isArray(data.categories)) {
      return { ...data, categories: await this.translateObject(data.categories, targetLang) };
    }

    return this.translateObject(data, targetLang);
  }
}

module.exports = new TranslationService();
