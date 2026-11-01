// قاعدة كلمة المرور: 6 أحرف على الأقل وتحتوي حرفاً إنجليزياً ورقماً واحداً على الأقل.
const PASSWORD_MESSAGE = 'كلمة المرور 6 أحرف على الأقل، وتحتوي حروفاً إنجليزية وأرقاماً';
const isValidPassword = (p) => typeof p === 'string' && p.length >= 6 && p.length <= 200 && /[A-Za-z]/.test(p) && /\d/.test(p);

module.exports = { PASSWORD_MESSAGE, isValidPassword };
