/**
 * AI 字幕与翻译模块
 * 提供实时语音识别、翻译和字幕显示功能
 */
(function() {
  'use strict';

  // ==================== 统一语音识别引擎 ====================
  class SpeechRecognitionEngine {
    constructor(config) {
      this.config = config;
      this.engine = null;
      this.engineType = config.engineType || 'browser'; // browser, whisper, custom
      this.isListening = false;
      this.onInterimResult = null;
      this.onFinalResult = null;
      this.onError = null;
      this.mediaRecorder = null;
      this.audioChunks = [];
      this.initEngine();
    }

    initEngine() {
      switch (this.engineType) {
        case 'browser':
          this.initWebSpeechAPI();
          break;
        case 'whisper':
          this.initWhisperEngine();
          break;
        case 'custom':
          this.initCustomAPI();
          break;
        default:
          console.warn('未知的语音识别引擎类型，使用默认浏览器引擎');
          this.initWebSpeechAPI();
      }
    }

    initWebSpeechAPI() {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        console.error('浏览器不支持 Web Speech API');
        return;
      }

      this.engine = new SpeechRecognition();
      this.engine.continuous = true; // 连续识别
      this.engine.interimResults = true; // 临时结果
      this.engine.lang = this.config.sourceLang || 'zh-CN';
      this.engine.maxAlternatives = 1;

      // 识别结果回调
      this.engine.onresult = (event) => {
        const latestResult = event.results[event.results.length - 1];
        const transcript = latestResult[0].transcript;

        if (latestResult.isFinal) {
          // 最终结果
          console.log('最终识别结果:', transcript);
          if (this.onFinalResult) {
            this.onFinalResult(transcript, this.engine.lang);
          }
        } else {
          // 临时结果
          console.log('临时识别结果:', transcript);
          if (this.onInterimResult) {
            this.onInterimResult(transcript);
          }
        }
      };

      // 错误处理
      this.engine.onerror = (event) => {
        console.error('语音识别错误:', event.error);
        if (this.onError) {
          this.onError(event.error);
        }

        // 自动重启策略
        if (event.error === 'network' && this.isListening) {
          console.log('网络错误，3秒后重启识别...');
          setTimeout(() => {
            if (this.isListening) this.start();
          }, 3000);
        }
      };

      // 识别结束（自动重启以保持连续识别）
      this.engine.onend = () => {
        if (this.isListening) {
          console.log('识别结束，自动重启...');
          setTimeout(() => {
            if (this.isListening) this.start();
          }, 100);
        }
      };

      console.log('Web Speech API 识别引擎初始化完成');
    }

    initWhisperEngine() {
      // OpenAI Whisper API 实现
      console.log('初始化 OpenAI Whisper 引擎...');
      this.engine = {
        type: 'whisper',
        isReady: true
      };
    }

    initCustomAPI() {
      // 自定义API实现
      console.log('初始化自定义语音识别API...');
      this.engine = {
        type: 'custom',
        isReady: true,
        endpoint: this.config.customEndpoint || ''
      };
    }

    async start() {
      if (!this.engine) {
        console.error('语音识别引擎未初始化');
        return;
      }

      if (!this.isListening) {
        try {
          if (this.engineType === 'browser') {
            this.engine.start();
            this.isListening = true;
            console.log('开始语音识别 (浏览器引擎)');
          } else if (this.engineType === 'whisper') {
            await this.startWhisperRecognition();
          } else if (this.engineType === 'custom') {
            await this.startCustomRecognition();
          }
        } catch (error) {
          console.error('启动语音识别失败:', error);
          if (this.onError) {
            this.onError('start_failed');
          }
        }
      }
    }

    stop() {
      if (this.engine && this.isListening) {
        try {
          if (this.engineType === 'browser') {
            this.engine.stop();
          } else if (this.mediaRecorder) {
            this.mediaRecorder.stop();
          }
          this.isListening = false;
          console.log('停止语音识别');
        } catch (error) {
          console.error('停止语音识别失败:', error);
        }
      }
    }

    updateLanguage(lang) {
      this.config.sourceLang = lang;
      if (this.engineType === 'browser' && this.engine) {
        this.engine.lang = lang;
        console.log('更新识别语言:', lang);
      }
    }

    isActive() {
      return this.isListening;
    }

    // OpenAI Whisper 实现
    async startWhisperRecognition() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.mediaRecorder = new MediaRecorder(stream);
        this.audioChunks = [];

        this.mediaRecorder.ondataavailable = (event) => {
          this.audioChunks.push(event.data);
        };

        this.mediaRecorder.onstop = async () => {
          if (this.isListening && this.audioChunks.length > 0) {
            const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
            await this.processWhisperAudio(audioBlob);
            this.audioChunks = [];

            // 继续录音
            if (this.isListening) {
              setTimeout(() => {
                if (this.isListening) this.startWhisperRecognition();
              }, 100);
            }
          }
        };

        // 定期停止录音以处理音频（每3秒）
        this.mediaRecorder.start();
        this.isListening = true;

        setTimeout(() => {
          if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            this.mediaRecorder.stop();
          }
        }, 3000);

      } catch (error) {
        console.error('Whisper录音启动失败:', error);
        throw error;
      }
    }

    async processWhisperAudio(audioBlob) {
      if (!this.config.apiKey) {
        console.error('缺少 OpenAI API 密钥');
        if (this.onError) this.onError('no_api_key');
        return;
      }

      try {
        const formData = new FormData();
        formData.append('file', audioBlob, 'audio.webm');
        formData.append('model', 'whisper-1');
        formData.append('language', this.config.sourceLang?.substring(0, 2) || 'zh');

        const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`
          },
          body: formData
        });

        if (!response.ok) {
          throw new Error(`Whisper API 错误: ${response.status}`);
        }

        const data = await response.json();
        if (data.text && this.onFinalResult) {
          this.onFinalResult(data.text.trim(), this.config.sourceLang || 'auto');
        }

      } catch (error) {
        console.error('Whisper 处理失败:', error);
        if (this.onError) this.onError('whisper_api_error');
      }
    }

    // 自定义API 实现
    async startCustomRecognition() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.mediaRecorder = new MediaRecorder(stream);
        this.audioChunks = [];

        this.mediaRecorder.ondataavailable = (event) => {
          this.audioChunks.push(event.data);
        };

        this.mediaRecorder.onstop = async () => {
          if (this.isListening && this.audioChunks.length > 0) {
            const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
            await this.processCustomAudio(audioBlob);
            this.audioChunks = [];

            if (this.isListening) {
              setTimeout(() => {
                if (this.isListening) this.startCustomRecognition();
              }, 100);
            }
          }
        };

        this.mediaRecorder.start();
        this.isListening = true;

        setTimeout(() => {
          if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            this.mediaRecorder.stop();
          }
        }, 3000);

      } catch (error) {
        console.error('自定义API录音启动失败:', error);
        throw error;
      }
    }

    async processCustomAudio(audioBlob) {
      if (!this.config.customEndpoint) {
        console.error('缺少自定义API端点');
        if (this.onError) this.onError('no_endpoint');
        return;
      }

      try {
        const formData = new FormData();
        formData.append('audio', audioBlob, 'audio.webm');
        formData.append('language', this.config.sourceLang || 'auto');

        const response = await fetch(this.config.customEndpoint, {
          method: 'POST',
          headers: this.config.customHeaders || {},
          body: formData
        });

        if (!response.ok) {
          throw new Error(`自定义API错误: ${response.status}`);
        }

        const data = await response.json();
        if (data.text && this.onFinalResult) {
          this.onFinalResult(data.text.trim(), data.language || this.config.sourceLang);
        }

      } catch (error) {
        console.error('自定义API处理失败:', error);
        if (this.onError) this.onError('custom_api_error');
      }
    }
  }

  // 保留旧的WebSpeechEngine类名作为别名
  class WebSpeechEngine extends SpeechRecognitionEngine {
    constructor(config) {
      config.engineType = 'browser';
      super(config);
    }
  }

  // ==================== 翻译服务 ====================
  class TranslationService {
    constructor(config) {
      this.config = config;
      this.cache = new Map(); // 简单的内存缓存
      this.onTranslationError = null;
      this.retryCount = 0;
      this.maxRetries = 3;
    }

    async translate(text, sourceLang, targetLang) {
      if (!text || !targetLang || sourceLang === targetLang) {
        return text;
      }

      // 检查缓存
      const cacheKey = `${sourceLang}:${targetLang}:${text}`;
      if (this.cache.has(cacheKey)) {
        return this.cache.get(cacheKey);
      }

      try {
        let translatedText = '';

        switch (this.config.translationApi) {
          case 'openai':
            translatedText = await this.translateWithOpenAI(text, sourceLang, targetLang);
            break;
          case 'deepl':
            translatedText = await this.translateWithDeepL(text, sourceLang, targetLang);
            break;
          case 'google':
            translatedText = await this.translateWithGoogle(text, sourceLang, targetLang);
            break;
          case 'baidu':
            translatedText = await this.translateWithBaidu(text, sourceLang, targetLang);
            break;
          default:
            translatedText = text;
        }

        // 缓存结果
        this.cache.set(cacheKey, translatedText);

        // 限制缓存大小
        if (this.cache.size > 1000) {
          const firstKey = this.cache.keys().next().value;
          this.cache.delete(firstKey);
        }

        return translatedText;
      } catch (error) {
        console.error('翻译失败:', error);

        // 翻译失败时的降级策略
        if (this.onTranslationError) {
          this.onTranslationError(error, text);
        }

        // 尝试使用备用翻译服务
        if (this.config.fallbackApi && this.config.translationApi !== this.config.fallbackApi) {
          console.log(`尝试使用备用翻译服务: ${this.config.fallbackApi}`);
          const originalApi = this.config.translationApi;
          this.config.translationApi = this.config.fallbackApi;

          try {
            const fallbackResult = await this.translate(text, sourceLang, targetLang);
            this.config.translationApi = originalApi;
            return fallbackResult;
          } catch (fallbackError) {
            this.config.translationApi = originalApi;
            console.error('备用翻译服务也失败:', fallbackError);
          }
        }

        return text; // 失败时返回原文
      }
    }

    async translateWithOpenAI(text, sourceLang, targetLang) {
      if (!this.config.apiKey) {
        throw new Error('缺少 OpenAI API 密钥');
      }

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [{
            role: 'user',
            content: `Translate the following text from ${sourceLang} to ${targetLang}. Only return the translation, no explanations: ${text}`
          }],
          temperature: 0.1,
          max_tokens: 256
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI API 错误: ${response.status}`);
      }

      const data = await response.json();
      return data.choices[0].message.content.trim();
    }

    async translateWithDeepL(text, sourceLang, targetLang) {
      if (!this.config.apiKey) {
        throw new Error('缺少 DeepL API 密钥');
      }

      const response = await fetch('https://api-free.deepl.com/v2/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `DeepL-Auth-Key ${this.config.apiKey}`
        },
        body: JSON.stringify({
          text: [text],
          source_lang: sourceLang.toUpperCase().replace('-', '-'),
          target_lang: targetLang.toUpperCase().replace('-', '-')
        })
      });

      if (!response.ok) {
        throw new Error(`DeepL API 错误: ${response.status}`);
      }

      const data = await response.json();
      return data.translations[0].text;
    }

    async translateWithGoogle(text, sourceLang, targetLang) {
      if (!this.config.apiKey) {
        throw new Error('缺少 Google Cloud API 密钥');
      }

      // Google Cloud Translation API v3
      const response = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${this.config.apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          q: text,
          source: sourceLang.replace('-', '-').substring(0, 2).toLowerCase(),
          target: targetLang.replace('-', '-').substring(0, 2).toLowerCase(),
          format: 'text'
        })
      });

      if (!response.ok) {
        throw new Error(`Google Translation API 错误: ${response.status}`);
      }

      const data = await response.json();
      return data.data.translations[0].translatedText;
    }

    async translateWithBaidu(text, sourceLang, targetLang) {
      if (!this.config.apiKey) {
        throw new Error('缺少百度翻译 API 密钥');
      }

      // 百度翻译需要AppID和密钥，这里我们假设apiKey格式为 "appId:secretKey"
      const [appId, secretKey] = this.config.apiKey.split(':');
      if (!appId || !secretKey) {
        throw new Error('百度翻译API密钥格式错误，应为: appId:secretKey');
      }

      // 百度翻译语言代码转换
      const langMap = {
        'zh-CN': 'zh',
        'en-US': 'en',
        'ja-JP': 'jp',
        'ko-KR': 'kor',
        'fr-FR': 'fra',
        'de-DE': 'de',
        'es-ES': 'spa'
      };

      const from = langMap[sourceLang] || 'auto';
      const to = langMap[targetLang] || 'en';

      // 生成签名
      const salt = Date.now().toString();
      const query = text;
      const signStr = appId + query + salt + secretKey;
      const sign = this.md5(signStr);

      const response = await fetch(`https://fanyi-api.baidu.com/api/trans/vip/translate?q=${encodeURIComponent(query)}&from=${from}&to=${to}&appid=${appId}&salt=${salt}&sign=${sign}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`百度翻译 API 错误: ${response.status}`);
      }

      const data = await response.json();

      if (data.error_code) {
        throw new Error(`百度翻译错误: ${data.error_msg || data.error_code}`);
      }

      return data.trans_result[0].dst;
    }

    // MD5签名函数（简化版本，用于百度翻译）
    md5(string) {
      function md5cycle(x, k) {
        var a = x[0], b = x[1], c = x[2], d = x[3];
        a = ff(a, b, c, d, k[0], 7, -680876936);
        d = ff(d, a, b, c, k[1], 12, -389564586);
        c = ff(c, d, a, b, k[2], 17, 606105819);
        b = ff(b, c, d, a, k[3], 22, -1044525330);
        a = ff(a, b, c, d, k[4], 7, -176418897);
        d = ff(d, a, b, c, k[5], 12, 1200080426);
        c = ff(c, d, a, b, k[6], 17, -1473231341);
        b = ff(b, c, d, a, k[7], 22, -45705983);
        a = ff(a, b, c, d, k[8], 7, 1770035416);
        d = ff(d, a, b, c, k[9], 12, -1958414417);
        c = ff(c, d, a, b, k[10], 17, -42063);
        b = ff(b, c, d, a, k[11], 22, -1990404162);
        a = ff(a, b, c, d, k[12], 7, 1804603682);
        d = ff(d, a, b, c, k[13], 12, -40341101);
        c = ff(c, d, a, b, k[14], 17, -1502002290);
        b = ff(b, c, d, a, k[15], 22, 1236535329);
        a = gg(a, b, c, d, k[1], 5, -165796510);
        d = gg(d, a, b, c, k[6], 9, -1069501632);
        c = gg(c, d, a, b, k[11], 14, 643717713);
        b = gg(b, c, d, a, k[0], 20, -373897302);
        a = gg(a, b, c, d, k[5], 5, -701558691);
        d = gg(d, a, b, c, k[10], 9, 38016083);
        c = gg(c, d, a, b, k[15], 14, -660478335);
        b = gg(b, c, d, a, k[4], 20, -405537848);
        a = gg(a, b, c, d, k[9], 5, 568446438);
        d = gg(d, a, b, c, k[14], 9, -1019803690);
        c = gg(c, d, a, b, k[3], 14, -187363961);
        b = gg(b, c, d, a, k[8], 20, 1163531501);
        a = gg(a, b, c, d, k[13], 5, -1444681467);
        d = gg(d, a, b, c, k[2], 9, -51403784);
        c = gg(c, d, a, b, k[7], 14, 1735328473);
        b = gg(b, c, d, a, k[12], 20, -1926607734);
        a = hh(a, b, c, d, k[5], 4, -378558);
        d = hh(d, a, b, c, k[8], 11, -2022574463);
        c = hh(c, d, a, b, k[11], 16, 1839030562);
        b = hh(b, c, d, a, k[14], 23, -35309556);
        a = hh(a, b, c, d, k[1], 4, -1530992060);
        d = hh(d, a, b, c, k[4], 11, 1272893353);
        c = hh(c, d, a, b, k[7], 16, -155497632);
        b = hh(b, c, d, a, k[10], 23, -1094730640);
        a = hh(a, b, c, d, k[13], 4, 681279174);
        d = hh(d, a, b, c, k[0], 11, -358537222);
        c = hh(c, d, a, b, k[3], 16, -722521979);
        b = hh(b, c, d, a, k[6], 23, 76029189);
        a = hh(a, b, c, d, k[9], 4, -640364487);
        d = hh(d, a, b, c, k[12], 11, -421815835);
        c = hh(c, d, a, b, k[15], 16, 530742520);
        b = hh(b, c, d, a, k[2], 23, -995338651);
        a = ii(a, b, c, d, k[0], 6, -198630844);
        d = ii(d, a, b, c, k[7], 10, 1126891415);
        c = ii(c, d, a, b, k[14], 15, -1416354905);
        b = ii(b, c, d, a, k[5], 21, -57434055);
        a = ii(a, b, c, d, k[12], 6, 1700485571);
        d = ii(d, a, b, c, k[3], 10, -1894986606);
        c = ii(c, d, a, b, k[10], 15, -1051523);
        b = ii(b, c, d, a, k[1], 21, -2054922799);
        a = ii(a, b, c, d, k[8], 6, 1873313359);
        d = ii(d, a, b, c, k[15], 10, -30611744);
        c = ii(c, d, a, b, k[6], 15, -1560198380);
        b = ii(b, c, d, a, k[13], 21, 1309151649);
        a = ii(a, b, c, d, k[4], 6, -145523070);
        d = ii(d, a, b, c, k[11], 10, -1120210379);
        c = ii(c, d, a, b, k[2], 15, 718787259);
        b = ii(b, c, d, a, k[9], 21, -343485551);
        x[0] = add32(a, x[0]);
        x[1] = add32(b, x[1]);
        x[2] = add32(c, x[2]);
        x[3] = add32(d, x[3]);
      }

      function cmn(q, a, b, x, s, t) {
        a = add32(add32(a, q), add32(x, t));
        return add32((a << s) | (a >>> (32 - s)), b);
      }

      function ff(a, b, c, d, x, s, t) {
        return cmn((b & c) | ((~b) & d), a, b, x, s, t);
      }

      function gg(a, b, c, d, x, s, t) {
        return cmn((b & d) | (c & (~d)), a, b, x, s, t);
      }

      function hh(a, b, c, d, x, s, t) {
        return cmn(b ^ c ^ d, a, b, x, s, t);
      }

      function ii(a, b, c, d, x, s, t) {
        return cmn(c ^ (b | (~d)), a, b, x, s, t);
      }

      function md5(s) {
        var n = s.length, state = [1732584193, -271733879, -1732584194, 271733878], i;
        for (i = 64; i <= s.length; i += 64) {
          md5cycle(state, md5block(s.substring(i - 64, i)));
        }
        s = s.substring(i - 64);
        var tail = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        for (i = 0; i < s.length; i++)
          tail[i >> 2] |= s.charCodeAt(i) << ((i % 4) << 3);
        tail[i >> 2] |= 0x80 << ((i % 4) << 3);
        if (i > 55) {
          md5cycle(state, tail);
          for (i = 0; i < 16; i++) tail[i] = 0;
        }
        tail[14] = n * 8;
        md5cycle(state, tail);
        return state;
      }

      function md5block(s) {
        var md5bl = [];
        for (var i = 0; i < 64; i += 4) {
          md5bl[i >> 2] = s.charCodeAt(i) + (s.charCodeAt(i + 1) << 8) + (s.charCodeAt(i + 2) << 16) + (s.charCodeAt(i + 3) << 24);
        }
        return md5bl;
      }

      function add32(a, b) {
        return (a + b) & 0xFFFFFFFF;
      }

      var hash = md5(string);
      var hex = [];
      for (var i = 0; i < 4 * hash.length; i++) {
        hex.push((hash[i >> 2] >> ((i % 4) * 8 + 4)) & 0xF, (hash[i >> 2] >> ((i % 4) * 8)) & 0xF);
      }
      return hex.map(function(x) { return x.toString(16); }).join('');
    }
  }

  // ==================== 字幕管理器 ====================
  class SubtitleManager {
    constructor() {
      this.subtitleOverlay = null;
      this.subtitleOriginal = null;
      this.subtitleTranslated = null;
      this.currentSubtitle = null;
      this.translationService = null;
      this.recognitionEngine = null;
      this.isActive = false;
      this.interimTimer = null;
    }

    init() {
      // 创建字幕容器
      this.createSubtitleUI();

      // 初始化翻译服务
      this.translationService = new TranslationService({
        translationApi: window.config?.translationApi || 'openai',
        apiKey: window.config?.apiKey || ''
      });

      // 设置翻译错误回调
      this.translationService.onTranslationError = (error, text) => this.handleTranslationError(error, text);

      // 初始化语音识别引擎
      this.recognitionEngine = new SpeechRecognitionEngine({
        sourceLang: window.config?.sourceLang || 'auto',
        engineType: window.config?.sttEngine || 'browser',
        apiKey: window.config?.apiKey || '',
        customEndpoint: window.config?.customEndpoint || ''
      });

      // 设置回调
      this.recognitionEngine.onInterimResult = (text) => this.showInterimSubtitle(text);
      this.recognitionEngine.onFinalResult = (text, lang) => this.processFinalSubtitle(text, lang);
      this.recognitionEngine.onError = (error) => this.handleRecognitionError(error);

      console.log('字幕管理器初始化完成');
    }

    createSubtitleUI() {
      // 检查是否已存在
      if (document.getElementById('subtitleOverlay')) {
        this.subtitleOverlay = document.getElementById('subtitleOverlay');
        this.subtitleOriginal = document.getElementById('subtitleOriginal');
        this.subtitleTranslated = document.getElementById('subtitleTranslated');
        this.subtitleBox = document.getElementById('subtitleBox');
        this.updateSubtitlePosition();
        this.updateSubtitleStyle();
        return;
      }

      // 创建字幕覆盖层
      const videoContainer = document.getElementById('videoContainer');
      if (!videoContainer) return;

      const overlay = document.createElement('div');
      overlay.id = 'subtitleOverlay';
      overlay.className = 'subtitle-overlay hidden';
      overlay.innerHTML = `
        <div class="subtitle-box" id="subtitleBox">
          <div class="subtitle-loading hidden" id="subtitleLoading">🔄 正在识别...</div>
          <div class="subtitle-error hidden" id="subtitleError"></div>
          <div class="subtitle-original" id="subtitleOriginal"></div>
          <div class="subtitle-translated" id="subtitleTranslated"></div>
        </div>
      `;

      videoContainer.appendChild(overlay);

      this.subtitleOverlay = overlay;
      this.subtitleOriginal = document.getElementById('subtitleOriginal');
      this.subtitleTranslated = document.getElementById('subtitleTranslated');
      this.subtitleBox = document.getElementById('subtitleBox');
      this.subtitleLoading = document.getElementById('subtitleLoading');
      this.subtitleError = document.getElementById('subtitleError');

      // 应用配置的位置和样式
      this.updateSubtitlePosition();
      this.updateSubtitleStyle();
    }

    updateSubtitlePosition() {
      if (!this.subtitleOverlay) return;

      const position = window.config?.subtitlePosition || 'bottom';

      // 移除所有位置类
      this.subtitleOverlay.classList.remove('position-top', 'position-bottom');

      // 添加新位置类
      if (position === 'top') {
        this.subtitleOverlay.classList.add('position-top');
      } else {
        this.subtitleOverlay.classList.add('position-bottom');
      }

      console.log('字幕位置已更新:', position);
    }

    updateSubtitleStyle() {
      if (!this.subtitleBox) return;

      const fontSize = window.config?.subtitleFontSize || 'medium';
      const fontFamily = window.config?.subtitleFontFamily || 'default';
      const bgColor = window.config?.subtitleBgColor || 'semi-transparent';
      const textColor = window.config?.subtitleTextColor || 'auto';

      // 应用字体大小
      const fontSizes = {
        'small': '14px',
        'medium': '16px',
        'large': '18px',
        'x-large': '20px'
      };
      this.subtitleBox.style.fontSize = fontSizes[fontSize] || '16px';

      // 应用字体
      if (fontFamily !== 'default') {
        this.subtitleBox.style.fontFamily = fontFamily;
      }

      // 应用背景色
      const bgColors = {
        'transparent': 'transparent',
        'semi-transparent': 'rgba(0, 0, 0, 0.7)',
        'solid': 'rgba(0, 0, 0, 1)',
        'white-transparent': 'rgba(255, 255, 255, 0.8)',
        'white-solid': 'rgba(255, 255, 255, 1)'
      };

      // 根据主题选择合适的背景色
      const isLightTheme = document.documentElement.getAttribute('data-theme') === 'light';
      let finalBgColor = bgColors[bgColor];

      if (textColor === 'auto') {
        finalBgColor = isLightTheme ? 'rgba(0, 0, 0, 0.8)' : 'rgba(0, 0, 0, 0.7)';
      }

      this.subtitleBox.style.backgroundColor = finalBgColor;

      // 应用文字颜色
      if (textColor !== 'auto') {
        this.subtitleBox.style.color = textColor;
      } else {
        this.subtitleBox.style.color = isLightTheme ? '#ffffff' : '#eef1ff';
      }

      console.log('字幕样式已更新');
    }

    start() {
      if (!this.isActive) {
        // 更新配置
        this.updateEngineConfig();
        this.updateSubtitlePosition();
        this.updateSubtitleStyle();

        this.isActive = true;
        this.recognitionEngine.start();
        this.subtitleOverlay?.classList.remove('hidden');
        this.subtitleOverlay?.classList.add('active');
        console.log('字幕功能已启动');
      }
    }

    stop() {
      if (this.isActive) {
        this.isActive = false;
        this.recognitionEngine.stop();
        this.subtitleOverlay?.classList.remove('active');
        this.subtitleOverlay?.classList.add('hidden');
        this.clearSubtitles();
        console.log('字幕功能已停止');
      }
    }

    updateEngineConfig() {
      // 更新语音识别引擎配置
      if (this.recognitionEngine) {
        this.recognitionEngine.config.sourceLang = window.config?.sourceLang || 'auto';
        this.recognitionEngine.config.engineType = window.config?.sttEngine || 'browser';
        this.recognitionEngine.config.apiKey = window.config?.apiKey || '';
        this.recognitionEngine.config.customEndpoint = window.config?.customEndpoint || '';

        // 更新翻译服务配置
        if (this.translationService) {
          this.translationService.config.translationApi = window.config?.translationApi || 'openai';
          this.translationService.config.apiKey = window.config?.apiKey || '';
        }
      }
    }

    showInterimSubtitle(text) {
      if (!this.subtitleOriginal) return;

      this.subtitleOriginal.textContent = text;
      this.subtitleOriginal.classList.add('interim');

      // 清除之前的定时器
      if (this.interimTimer) {
        clearTimeout(this.interimTimer);
      }

      // 300ms 后如果还是临时结果，发送到服务器
      this.interimTimer = setTimeout(() => {
        if (this.subtitleOriginal.classList.contains('interim')) {
          // 发送临时结果（可选，用于减少延迟）
        }
      }, 300);
    }

    async processFinalSubtitle(text, sourceLang) {
      if (!text) return;

      // 移除临时标记
      if (this.subtitleOriginal) {
        this.subtitleOriginal.classList.remove('interim');
      }

      // 显示原文
      this.showOriginalSubtitle(text);

      // 显示翻译加载状态
      this.showLoading(true);

      // 翻译并显示译文
      const targetLang = window.config?.targetLang || 'en-US';
      try {
        const translatedText = await this.translationService.translate(text, sourceLang, targetLang);
        this.showTranslatedSubtitle(translatedText);

        // 发送到聊天室
        this.sendSubtitleToChat(text, translatedText, sourceLang, targetLang);

        // 自动清除字幕（根据配置，默认8秒）
        const autoClear = window.config?.autoClearSubtitle !== undefined ? window.config.autoClearSubtitle : true;
        if (autoClear) {
          setTimeout(() => {
            this.clearSubtitles();
          }, 8000);
        }

      } catch (error) {
        console.error('翻译失败:', error);
        this.handleTranslationError(error, text);
      } finally {
        // 隐藏加载状态
        this.showLoading(false);
      }
    }

    showOriginalSubtitle(text) {
      if (this.subtitleOriginal) {
        this.subtitleOriginal.textContent = text;
        this.subtitleOriginal.classList.add('show');
      }
    }

    showTranslatedSubtitle(text) {
      if (this.subtitleTranslated) {
        this.subtitleTranslated.textContent = text;
        this.subtitleTranslated.classList.add('show');
      }
    }

    clearSubtitles() {
      if (this.subtitleOriginal) {
        this.subtitleOriginal.textContent = '';
        this.subtitleOriginal.classList.remove('show', 'interim');
      }
      if (this.subtitleTranslated) {
        this.subtitleTranslated.textContent = '';
        this.subtitleTranslated.classList.remove('show');
      }
    }

    sendSubtitleToChat(originalText, translatedText, sourceLang, targetLang) {
      // 检查是否有socket连接和房间
      if (typeof window.socket === 'undefined' || !window.currentRoomId) {
        console.log('未连接或未加入房间，跳过发送字幕到聊天室');
        return;
      }

      // 发送字幕消息到服务器
      window.socket.emit('subtitleMessage', {
        roomId: window.currentRoomId,
        originalText: originalText,
        translatedText: translatedText,
        sourceLang: sourceLang,
        targetLang: targetLang,
        speaker: window.config?.nickname || 'Unknown'
      });

      console.log('字幕已发送到聊天室:', { originalText, translatedText });
    }

    handleRecognitionError(error) {
      console.error('语音识别错误:', error);

      let errorMessage = '语音识别遇到问题';
      let userFriendlyMessage = '语音识别暂时不可用';

      switch (error) {
        case 'not-allowed':
          errorMessage = '麦克风权限被拒绝，请在浏览器设置中允许';
          userFriendlyMessage = '🎤 请允许麦克风访问以使用语音识别功能';
          break;
        case 'network':
          errorMessage = '网络连接失败，检查网络连接';
          userFriendlyMessage = '🌐 网络连接异常，语音识别暂时不可用';
          break;
        case 'no-speech':
          errorMessage = '未检测到语音输入';
          userFriendlyMessage = '🔇 未检测到语音输入，请检查麦克风';
          break;
        case 'audio-capture':
          errorMessage = '音频捕获失败';
          userFriendlyMessage = '🎧 音频设备不可用，请检查麦克风设置';
          break;
        case 'whisper_api_error':
          errorMessage = 'Whisper API调用失败';
          userFriendlyMessage = '🤖 AI翻译服务暂时不可用，正在重试...';
          break;
        default:
          errorMessage = `识别错误: ${error}`;
          userFriendlyMessage = `⚠️ 语音识别错误: ${error}`;
      }

      // 显示错误提示
      if (typeof showNotice === 'function') {
        showNotice(userFriendlyMessage);
      }

      // 在字幕区域显示错误（如果已启动）
      if (this.isActive && this.subtitleError) {
        this.showError(userFriendlyMessage);
      }

      console.error(errorMessage);
    }

    showError(message) {
      if (this.subtitleError) {
        this.subtitleError.textContent = message;
        this.subtitleError.classList.remove('hidden');
        this.subtitleError.classList.add('show');

        // 5秒后自动隐藏错误
        setTimeout(() => {
          if (this.subtitleError) {
            this.subtitleError.classList.remove('show');
            this.subtitleError.classList.add('hidden');
          }
        }, 5000);
      }
    }

    showLoading(show = true) {
      if (this.subtitleLoading) {
        if (show) {
          this.subtitleLoading.classList.remove('hidden');
          this.subtitleLoading.classList.add('show');
        } else {
          this.subtitleLoading.classList.remove('show');
          this.subtitleLoading.classList.add('hidden');
        }
      }
    }

    handleTranslationError(error, originalText) {
      console.error('翻译错误:', error);

      let errorMessage = '翻译服务暂时不可用';

      if (error.message) {
        if (error.message.includes('API')) {
          errorMessage = '🌐 翻译API调用失败，显示原文';
        } else if (error.message.includes('网络')) {
          errorMessage = '🔌 网络连接异常，翻译暂停';
        } else {
          errorMessage = `⚠️ 翻译错误: ${error.message}`;
        }
      }

      // 显示用户友好的错误提示
      if (typeof showNotice === 'function' && this.retryCount === 0) {
        showNotice(errorMessage);
        this.retryCount++;
      }

      // 仅在字幕区域显示简短错误
      if (this.isActive && this.subtitleTranslated) {
        this.subtitleTranslated.textContent = '(翻译暂时不可用)';
        this.subtitleTranslated.classList.add('translation-error');
      }
    }

    updateLanguage(sourceLang, targetLang) {
      if (this.recognitionEngine) {
        this.recognitionEngine.updateLanguage(sourceLang);
      }
      if (this.translationService) {
        this.translationService.config.targetLang = targetLang;
      }
    }

    isRunning() {
      return this.isActive;
    }
  }

  // ==================== 模块导出 ====================
  window.Subtitles = {
    manager: null,

    init() {
      if (!this.manager) {
        this.manager = new SubtitleManager();
        this.manager.init();
      }
      return this.manager;
    },

    start() {
      if (!this.manager) this.init();
      this.manager.start();
    },

    stop() {
      if (this.manager) {
        this.manager.stop();
      }
    },

    isRunning() {
      return this.manager?.isRunning() || false;
    },

    updateLanguage(sourceLang, targetLang) {
      if (this.manager) {
        this.manager.updateLanguage(sourceLang, targetLang);
      }
    }
  };

  // 页面加载完成后自动初始化（如果配置中启用了AI功能）
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (window.config?.aiEnabled) {
        console.log('AI功能已启用，自动初始化字幕模块');
        // 不自动启动，等待用户手动开启
        window.Subtitles.init();
      }
    });
  } else {
    if (window.config?.aiEnabled) {
      window.Subtitles.init();
    }
  }

})();