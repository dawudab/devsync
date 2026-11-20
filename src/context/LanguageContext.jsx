import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const LANG_KEY = 'devsync:language';

const DICT = {
  en: {
    'nav.feed': 'Feed',
    'nav.roadmap': 'Roadmap',
    'nav.requests': 'Requests',
    'nav.webhooks': 'Webhooks',
    'nav.settings': 'Settings',
    'role.owner': 'Business Owner',
    'role.team_member': 'Team Member',
    'role.developer': 'Developer',
    'settings.title': 'Settings',
    'settings.language': 'Language',
    'settings.languageDesc': 'Choose your preferred interface language.',
    'settings.businessProfile': 'Business profile',
    'settings.businessProfileDesc': 'Displayed on your executive dashboard.',
    'settings.links': 'Live & Preview Links',
    'settings.linksDesc': 'Pinned at the top of your Feed for one-tap testing.',
    'settings.teamInvites': 'Team & Invites',
    'settings.teamInvitesOwnerDesc': 'Generate role-locked invite messages or view workspace members.',
    'settings.teamInvitesMemberDesc': 'People with access to this private workspace.',
    'settings.dangerZone': 'Danger zone',
    'settings.account': 'Account',
    'settings.demoAccounts': 'Demo accounts',
    'settings.signOut': 'Sign out',
    'settings.deleteProject': 'Delete project',
    'settings.requestDeletion': 'Request project deletion',
    'settings.saveProfile': 'Save profile',
    'settings.saveLinks': 'Save links',
    'settings.newInvite': 'New invite',
    'settings.copyInviteMessage': 'Copy Invite Message',
    'settings.share': 'Share',
    'settings.github': 'GitHub',
    'settings.githubDesc': 'DevSync listens to your repository through a secure GitHub App.',
    'feed.devTitle': 'Developer Feed',
    'feed.ownerSub': 'Executive overview & recent product updates.',
    'feed.digestTitle': 'Weekly Executive Digest',
    'feed.shipped': 'Shipped',
    'feed.milestones': 'Milestones',
    'feed.signOffs': 'Sign-offs',
    'feed.shippedWeek': 'Shipped this week',
    'feed.inWorks': 'In the works',
    'feed.openRequests': 'Open requests',
    'feed.approveUpdate': 'Approve Update',
    'feed.requestTweaks': 'Request Tweaks',
    'roadmap.title': 'Roadmap',
    'roadmap.subtitle': 'Project phases, target dates, and delivery progress.',
    'roadmap.newMilestone': 'New milestone',
    'requests.board': 'Ticket board',
    'requests.title': 'Requests & Ideas',
    'requests.newRequest': 'New request',
    'requests.newSuggestion': 'New suggestion',
    'workspace.private': 'Private workspace',
  },
  ar: {
    'nav.feed': 'التحديثات',
    'nav.roadmap': 'خارطة الطريق',
    'nav.requests': 'الطلبات',
    'nav.webhooks': 'الويب هوك',
    'nav.settings': 'الإعدادات',
    'role.owner': 'صاحب العمل',
    'role.team_member': 'عضو الفريق',
    'role.developer': 'المطور',
    'settings.title': 'الإعدادات',
    'settings.language': 'اللغة',
    'settings.languageDesc': 'اختر لغة الواجهة المفضلة لديك.',
    'settings.businessProfile': 'ملف النشاط التجاري',
    'settings.businessProfileDesc': 'يظهر في لوحة القيادة التنفيذية.',
    'settings.links': 'روابط المعاينة والموقع المباشر',
    'settings.linksDesc': 'مثبتة في أعلى صفحة التحديثات للاختبار السريع.',
    'settings.teamInvites': 'الفريق والدعوات',
    'settings.teamInvitesOwnerDesc': 'أنشئ رسائل دعوة مرتبطة بالدور أو أدر أعضاء مساحة العمل.',
    'settings.teamInvitesMemberDesc': 'الأشخاص الذين لديهم صلاحية الوصول إلى مساحة العمل الخاصة هذه.',
    'settings.dangerZone': 'منطقة الخطر',
    'settings.account': 'الحساب',
    'settings.demoAccounts': 'حسابات العرض التجريبي',
    'settings.signOut': 'تسجيل الخروج',
    'settings.deleteProject': 'حذف المشروع',
    'settings.requestDeletion': 'طلب حذف المشروع',
    'settings.saveProfile': 'حفظ الملف',
    'settings.saveLinks': 'حفظ الروابط',
    'settings.newInvite': 'دعوة جديدة',
    'settings.copyInviteMessage': 'نسخ رسالة الدعوة',
    'settings.share': 'مشاركة',
    'settings.github': 'GitHub',
    'settings.githubDesc': 'يتابع DevSync مستودعك البرمجي عبر تطبيق GitHub آمن.',
    'feed.devTitle': 'تحديثات المطور',
    'feed.ownerSub': 'نظرة تنفيذية وأحدث تطورات المنتج.',
    'feed.digestTitle': 'الملخص التنفيذي الأسبوعي',
    'feed.shipped': 'تم الإطلاق',
    'feed.milestones': 'المراحل',
    'feed.signOffs': 'بانتظار الاعتماد',
    'feed.shippedWeek': 'أُطلق هذا الأسبوع',
    'feed.inWorks': 'قيد التنفيذ',
    'feed.openRequests': 'الطلبات المفتوحة',
    'feed.approveUpdate': 'اعتماد التحديث',
    'feed.requestTweaks': 'طلب تعديلات',
    'roadmap.title': 'خارطة الطريق',
    'roadmap.subtitle': 'مراحل المشروع والتواريخ المستهدفة ونسبة الإنجاز.',
    'roadmap.newMilestone': 'مرحلة جديدة',
    'requests.board': 'لوحة التذاكر',
    'requests.title': 'الطلبات والأفكار',
    'requests.newRequest': 'طلب جديد',
    'requests.newSuggestion': 'اقتراح جديد',
    'workspace.private': 'مساحة عمل خاصة',
  },
};

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    const saved = localStorage.getItem(LANG_KEY);
    return saved === 'ar' ? 'ar' : 'en';
  });

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  const setLang = useCallback((next) => {
    const valid = next === 'ar' ? 'ar' : 'en';
    localStorage.setItem(LANG_KEY, valid);
    setLangState(valid);
  }, []);

  const t = useCallback((key) => DICT[lang]?.[key] ?? DICT.en[key] ?? key, [lang]);

  const value = useMemo(() => ({ lang, setLang, isRtl: lang === 'ar', t }), [lang, setLang, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used inside <LanguageProvider>');
  return ctx;
}
