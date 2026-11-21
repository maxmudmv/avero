export type AppLanguage = "uz" | "en" | "ru";

export function normalizeAppLanguage(raw?: string | null): AppLanguage {
  if (!raw) return "uz";
  const short = raw.trim().toLowerCase().slice(0, 2);
  if (short === "en") return "en";
  if (short === "ru") return "ru";
  return "uz";
}

export interface AppTranslations {
  nav: {
    feed: string;
    search: string;
    compose: string;
    menu: string;
  };
  menu: {
    title: string;
    profile: string;
    profileDesc: string;
    notifications: string;
    notificationsAllRead: string;
    notificationsNew: (count: number) => string;
    bookmarks: string;
    bookmarksDesc: string;
    messages: string;
    messagesDesc: string;
    settings: string;
    settingsDesc: string;
    admin: string;
    help: string;
    helpDesc: string;
    signInPrompt: string;
    signInPasswordBtn: string;
    setupPasswordBtn: string;
    logout: string;
  };
  auth: {
    signIn: string;
    signInTitle: string;
    signInDesc: string;
    usernameLabel: string;
    passwordLabel: string;
    passwordPlaceholder: string;
    loginWithUsername: string;
    or: string;
    loginWithGoogle: string;
    loginWithTelegram: string;
    setupTitle: string;
    setupDesc: string;
    displayNameLabel: string;
    newPasswordLabel: string;
    confirmPasswordLabel: string;
    bioLabel: string;
    suggestions: string;
    later: string;
    save: string;
    cancel: string;
  };
  feed: {
    forYou: string;
    following: string;
    trending: string;
    timeRange: string;
    h24: string;
    d7: string;
    d30: string;
    writeBtn: string;
    emptyFollowingGuest: string;
    emptyFollowing: string;
    emptyAll: string;
    emptyFollowingHint: string;
    emptyAllHint: string;
    findPeople: string;
    writePost: string;
  };
  post: {
    now: string;
    min: string;
    hour: string;
    day: string;
    edited: string;
    commentsTitle: (count: number) => string;
    commentPlaceholder: string;
    replyPlaceholder: (username: string) => string;
    replyingTo: (username: string) => string;
    commentsLoading: string;
    noComments: string;
    commentsClosed: string;
    commentsFollowersOnly: string;
    reply: string;
    report: string;
    delete: string;
    edit: string;
    bookmarkAdd: string;
    bookmarkRemove: string;
    deleteForever: string;
    repostTitle: string;
    repostDesc: string;
    simpleRepost: string;
    removeRepost: string;
    editTitle: string;
    editDesc: string;
    postTextLabel: string;
    commentPolicyLabel: string;
    policyEveryone: string;
    policyFollowers: string;
    policyClosed: string;
  };
  compose: {
    pageTitle: string;
    newPost: string;
    draftSaving: string;
    draftSaved: string;
    limitLabel: (n: number) => string;
    commentPolicyTitle: string;
    placeholder: string;
    defaultHint: string;
    publish: string;
    privateDrafts: (count: number) => string;
    onlyYouSee: string;
  };
  search: {
    pageTitle: string;
    placeholder: string;
    all: string;
    posts: string;
    people: string;
    hashtags: string;
    searching: string;
    noResults: string;
    clearFilter: string;
    follow: string;
    following: string;
    requested: string;
  };
  settings: {
    pageTitle: string;
    appearanceTitle: string;
    languageLabel: string;
    languageSheetTitle: string;
    themeLabel: string;
    themeSystem: string;
    themeDark: string;
    themeLight: string;
    privacyTitle: string;
    privacyLevelLabel: string;
    privacyPublic: string;
    privacyPublicDesc: string;
    privacyPrivate: string;
    privacyPrivateDesc: string;
    showOnlineLabel: string;
    showOnlineDesc: string;
    autoApproveLabel: string;
    autoApproveDesc: string;
    allowMentionsLabel: string;
    allowMentionsDesc: string;
    telegramNotifLabel: string;
    telegramNotifDesc: string;
    emailNotifLabel: string;
    emailNotifDesc: string;
    notifEventsTitle: string;
    saveSettings: string;
    savedToast: string;
    accountTitle: string;
    activeSession: string;
    guest: string;
    signInToManage: string;
    connected: string;
    notConnected: string;
    logoutCurrent: string;
    logoutAll: string;
  };
  profile: {
    pageTitle: string;
    loading: string;
    posts: string;
    followers: string;
    following: string;
    unlockedAvatars: string;
    dailyActivityTitle: string;
    activeDayBadge: (day: number) => string;
    dailyActivityDesc: string;
    activeDaysLabel: string;
    profileAgeLabel: string;
    avatarsLabel: string;
    daysUnit: string;
    noPosts: string;
    editProfile: string;
    followRequests: (count: number) => string;
    approve: string;
    guestBanner: string;
  };
  pages: {
    bookmarks: string;
    notifications: string;
    messages: string;
    help: string;
    admin: string;
  };
}

const UZ: AppTranslations = {
  nav: {
    feed: "Lenta",
    search: "Qidiruv",
    compose: "Yozish",
    menu: "Menyu",
  },
  menu: {
    title: "Menyu",
    profile: "Profil",
    profileDesc: "Shaxsiy sahifa",
    notifications: "Bildirishnomalar",
    notificationsAllRead: "Hammasi o‘qilgan",
    notificationsNew: (n) => `${n} ta yangi`,
    bookmarks: "Saqlanganlar",
    bookmarksDesc: "Saqlab qo‘yilgan matnlar",
    messages: "Xabarlar",
    messagesDesc: "Shaxsiy yozishmalar",
    settings: "Sozlamalar",
    settingsDesc: "Til, mavzu, maxfiylik",
    admin: "Boshqaruv",
    help: "Yordam",
    helpDesc: "Qo‘llanma va tizim holati",
    signInPrompt: "Shaxsiy profil, postlar va bildirishnomalar uchun tizimga kiring",
    signInPasswordBtn: "Username va parol bilan kirish",
    setupPasswordBtn: "Username va parol o‘rnatish",
    logout: "Chiqish",
  },
  auth: {
    signIn: "Kirish",
    signInTitle: "Avero’ga kirish",
    signInDesc: "Username va parol bilan kiring yoki Google / Telegram orqali davom eting.",
    usernameLabel: "Username",
    passwordLabel: "Parol",
    passwordPlaceholder: "Parolingizni kiriting",
    loginWithUsername: "Username bilan kirish",
    or: "yoki",
    loginWithGoogle: "Google bilan kirish",
    loginWithTelegram: "Telegram orqali kirish",
    setupTitle: "Hisobingizni sozlang",
    setupDesc: "Username va parol o‘rnating — keyingi safar to‘g‘ridan-to‘g‘ri username va parol bilan ham kira olasiz.",
    displayNameLabel: "Ko‘rinadigan ism (1–40 belgi)",
    newPasswordLabel: "Parol (kamida 6 ta belgi)",
    confirmPasswordLabel: "Parolni tasdiqlang",
    bioLabel: "Bio (ixtiyoriy, maksimum 150 belgi)",
    suggestions: "Takliflar",
    later: "Keyinroq",
    save: "Saqlash",
    cancel: "Bekor qilish",
  },
  feed: {
    forYou: "Siz uchun",
    following: "Obunalar",
    trending: "Mashhurlar",
    timeRange: "Vaqt oralig‘i:",
    h24: "24 soat",
    d7: "7 kun",
    d30: "30 kun",
    writeBtn: "Yozish",
    emptyFollowingGuest: "Obunalar lentasini ko‘rish uchun tizimga kiring",
    emptyFollowing: "Siz hali birorta muallifni kuzatmayapsiz",
    emptyAll: "Hozircha postlar topilmadi",
    emptyFollowingHint: "Qidiruv bo‘limidan qiziqarli mualliflarni topib obuna bo‘ling.",
    emptyAllHint: "Birinchi matnli postni yozing.",
    findPeople: "Mualliflarni topish",
    writePost: "Post yozish",
  },
  post: {
    now: "Hozir",
    min: "daq",
    hour: "soat",
    day: "kun",
    edited: "(tahrirlangan)",
    commentsTitle: (n) => `Izohlar (${n})`,
    commentPlaceholder: "Izoh yozing...",
    replyPlaceholder: (u) => `@${u} ga javob yozing...`,
    replyingTo: (u) => `@${u} ga javob`,
    commentsLoading: "Izohlar yuklanmoqda...",
    noComments: "Hali izohlar yo‘q.",
    commentsClosed: "Muallif ushbu postda izohlarni yopgan.",
    commentsFollowersOnly: "Faqat muallifni kuzatuvchilar izoh yoza oladi.",
    reply: "Javob",
    report: "Shikoyat",
    delete: "O‘chirish",
    edit: "Tahrirlash",
    bookmarkAdd: "Saqlab qo‘yish",
    bookmarkRemove: "Saqlanganlardan olish",
    deleteForever: "Butunlay o‘chirish",
    repostTitle: "Repost qilish",
    repostDesc: "Oddiy repost yoki o‘z izohingiz bilan repost tanlang.",
    simpleRepost: "Oddiy repost",
    removeRepost: "Repostni olib tashlash",
    editTitle: "Postni tahrirlash",
    editDesc: "Faqat oxirgi versiya saqlanadi.",
    postTextLabel: "Post matni",
    commentPolicyLabel: "Izohlar tartibi",
    policyEveryone: "Hamma yoza oladi",
    policyFollowers: "Faqat obunachilar",
    policyClosed: "Izohlar yopilgan",
  },
  compose: {
    pageTitle: "Yozish",
    newPost: "Yangi post",
    draftSaving: "Qoralama saqlanmoqda...",
    draftSaved: "Qoralama saqlandi",
    limitLabel: (n) => `Limit: ${n} belgi`,
    commentPolicyTitle: "Kimlar izoh yoza oladi?",
    placeholder: "Fikringizni yozing... (#hashtag ham matn ichida yozilaveradi)",
    defaultHint: "Dastlabki limit: 1000 belgi. Har bir taklif qilgan do‘stingiz uchun +25 belgi qo‘shiladi.",
    publish: "Chop etish",
    privateDrafts: (n) => `Shaxsiy qoralamalar (${n})`,
    onlyYouSee: "Faqat sizga ko‘rinadi",
  },
  search: {
    pageTitle: "Qidiruv",
    placeholder: "Foydalanuvchi, #hashtag yoki post matnini qidiring...",
    all: "Barchasi",
    posts: "Postlar",
    people: "Mualliflar",
    hashtags: "Hashtaglar",
    searching: "Qidirilmoqda...",
    noResults: "Hech qanday natija topilmadi.",
    clearFilter: "Filtrni olib tashlash",
    follow: "Kuzatish",
    following: "Kuzatilmoqda",
    requested: "So‘rov yuborildi",
  },
  settings: {
    pageTitle: "Sozlamalar",
    appearanceTitle: "Ko‘rinish va Til",
    languageLabel: "Til tanlash",
    languageSheetTitle: "Ilova tilini tanlang",
    themeLabel: "Dark / Light rejim",
    themeSystem: "Tizim",
    themeDark: "OLED Dark",
    themeLight: "Pearl Light",
    privacyTitle: "Maxfiylik va Bildirishnomalar",
    privacyLevelLabel: "Maxfiylik darajasi (kuzatish so‘rovlari)",
    privacyPublic: "Public (Ochiq kuzatish)",
    privacyPublicDesc: "Postlar ommaviy, istalgan foydalanuvchi darhol kuzatadi",
    privacyPrivate: "Private (So‘rov bilan kuzatish)",
    privacyPrivateDesc: "Postlar ommaviy, kuzatish so‘rovlarini siz tasdiqlaysiz",
    showOnlineLabel: "Onlayn holatini ko‘rsatish",
    showOnlineDesc: "Profil sahifangizda faollik indikatorini yoqish yoki o‘chirish",
    autoApproveLabel: "Kuzatish so‘rovlarini avtomatik tasdiqlash",
    autoApproveDesc: "O‘chirilsa, yangi kuzatuvchilar tasdiqlash ro‘yxatiga tushadi",
    allowMentionsLabel: "@belgilashga ruxsat berish",
    allowMentionsDesc: "Boshqalar sizni post va izohlarda @username bilan belgilay oladi",
    telegramNotifLabel: "Telegram bot bildirishnomalari",
    telegramNotifDesc: "Avval Telegram botni /start qilingan bo‘lishi kerak",
    emailNotifLabel: "Email bildirishnomalari",
    emailNotifDesc: "Muhim xavfsizlik va tizim xabarlari uchun",
    notifEventsTitle: "Qaysi hodisalar haqida xabar berilsin",
    saveSettings: "Sozlamalarni saqlash",
    savedToast: "Sozlamalar saqlandi",
    accountTitle: "Akkaunt sozlamalari",
    activeSession: "Faol sessiya",
    guest: "Mehmon",
    signInToManage: "Google yoki Telegram akkauntlaringizni boshqarish uchun avval tizimga kiring.",
    connected: "Ulangan",
    notConnected: "Ulanmagan",
    logoutCurrent: "Joriy sessiyadan chiqish",
    logoutAll: "Barcha qurilmalardan chiqish",
  },
  profile: {
    pageTitle: "Profil",
    loading: "Profil yuklanmoqda...",
    posts: "Postlar",
    followers: "Followers",
    following: "Following",
    unlockedAvatars: "Ochilgan avatarlar",
    dailyActivityTitle: "Kunlik faollik va avatarlar",
    activeDayBadge: (d) => `${d}-faol kun`,
    dailyActivityDesc: "Har faol bo‘lgan kuningizda 1 tadan yangi avatar avtomatik ochilib boradi. (Faqat sizga ko‘rinadi)",
    activeDaysLabel: "Faol kunlar",
    profileAgeLabel: "Profil yoshi",
    avatarsLabel: "Avatarlar",
    daysUnit: "kun",
    noPosts: "Hali chop etilgan postlar yo‘q.",
    editProfile: "Tahrirlash",
    followRequests: (n) => `Kuzatish so‘rovlari (${n})`,
    approve: "Tasdiqlash",
    guestBanner: "Shaxsiy profil, kunlik avatarlar va barcha imkoniyatlarni ochish uchun hisobingizga kiring.",
  },
  pages: {
    bookmarks: "Saqlanganlar",
    notifications: "Bildirishnomalar",
    messages: "Xabarlar",
    help: "Yordam",
    admin: "Boshqaruv",
  },
};

const EN: AppTranslations = {
  nav: {
    feed: "Feed",
    search: "Search",
    compose: "Write",
    menu: "Menu",
  },
  menu: {
    title: "Menu",
    profile: "Profile",
    profileDesc: "Personal page",
    notifications: "Notifications",
    notificationsAllRead: "All caught up",
    notificationsNew: (n) => `${n} new`,
    bookmarks: "Saved",
    bookmarksDesc: "Bookmarked posts",
    messages: "Messages",
    messagesDesc: "Direct messages",
    settings: "Settings",
    settingsDesc: "Language, theme, privacy",
    admin: "Admin",
    help: "Help",
    helpDesc: "Guide & system status",
    signInPrompt: "Sign in to access your profile, posts, and notifications",
    signInPasswordBtn: "Sign in with username & password",
    setupPasswordBtn: "Set up username & password",
    logout: "Sign out",
  },
  auth: {
    signIn: "Sign in",
    signInTitle: "Sign in to Avero",
    signInDesc: "Sign in with your username and password or continue with Google / Telegram.",
    usernameLabel: "Username",
    passwordLabel: "Password",
    passwordPlaceholder: "Enter your password",
    loginWithUsername: "Sign in with username",
    or: "or",
    loginWithGoogle: "Continue with Google",
    loginWithTelegram: "Continue with Telegram",
    setupTitle: "Set up your account",
    setupDesc: "Choose your username and password so you can also sign in directly anytime.",
    displayNameLabel: "Display name (1–40 chars)",
    newPasswordLabel: "Password (min 6 characters)",
    confirmPasswordLabel: "Confirm password",
    bioLabel: "Bio (optional, max 150 chars)",
    suggestions: "Suggest",
    later: "Later",
    save: "Save",
    cancel: "Cancel",
  },
  feed: {
    forYou: "For you",
    following: "Following",
    trending: "Trending",
    timeRange: "Time range:",
    h24: "24h",
    d7: "7d",
    d30: "30d",
    writeBtn: "Write",
    emptyFollowingGuest: "Sign in to see posts from people you follow",
    emptyFollowing: "You aren't following anyone yet",
    emptyAll: "No posts yet",
    emptyFollowingHint: "Find interesting authors in Search and follow them.",
    emptyAllHint: "Write the very first post.",
    findPeople: "Find people",
    writePost: "Write a post",
  },
  post: {
    now: "Now",
    min: "m",
    hour: "h",
    day: "d",
    edited: "(edited)",
    commentsTitle: (n) => `Comments (${n})`,
    commentPlaceholder: "Write a comment...",
    replyPlaceholder: (u) => `Reply to @${u}...`,
    replyingTo: (u) => `Replying to @${u}`,
    commentsLoading: "Loading comments...",
    noComments: "No comments yet.",
    commentsClosed: "Comments are disabled on this post.",
    commentsFollowersOnly: "Only followers can comment on this post.",
    reply: "Reply",
    report: "Report",
    delete: "Delete",
    edit: "Edit",
    bookmarkAdd: "Save post",
    bookmarkRemove: "Remove from saved",
    deleteForever: "Delete permanently",
    repostTitle: "Repost",
    repostDesc: "Choose a simple repost or add your own quote.",
    simpleRepost: "Simple repost",
    removeRepost: "Remove repost",
    editTitle: "Edit post",
    editDesc: "Only the latest version is kept.",
    postTextLabel: "Post text",
    commentPolicyLabel: "Who can comment",
    policyEveryone: "Everyone",
    policyFollowers: "Followers only",
    policyClosed: "Comments off",
  },
  compose: {
    pageTitle: "Write",
    newPost: "New post",
    draftSaving: "Saving draft...",
    draftSaved: "Draft saved",
    limitLabel: (n) => `Limit: ${n} chars`,
    commentPolicyTitle: "Who can comment?",
    placeholder: "Write your thoughts... (type #hashtag directly in the text)",
    defaultHint: "Base limit: 1000 characters. Each invited friend adds +25 characters.",
    publish: "Publish",
    privateDrafts: (n) => `Private drafts (${n})`,
    onlyYouSee: "Only visible to you",
  },
  search: {
    pageTitle: "Search",
    placeholder: "Search users, #hashtags, or posts...",
    all: "All",
    posts: "Posts",
    people: "People",
    hashtags: "Hashtags",
    searching: "Searching...",
    noResults: "No results found.",
    clearFilter: "Clear filter",
    follow: "Follow",
    following: "Following",
    requested: "Requested",
  },
  settings: {
    pageTitle: "Settings",
    appearanceTitle: "Appearance & Language",
    languageLabel: "Language",
    languageSheetTitle: "Choose app language",
    themeLabel: "Dark / Light mode",
    themeSystem: "System",
    themeDark: "OLED Dark",
    themeLight: "Pearl Light",
    privacyTitle: "Privacy & Notifications",
    privacyLevelLabel: "Privacy level (follow requests)",
    privacyPublic: "Public (Open follow)",
    privacyPublicDesc: "Posts are public; anyone can follow you immediately",
    privacyPrivate: "Private (Approve followers)",
    privacyPrivateDesc: "Posts are public; you approve follow requests manually",
    showOnlineLabel: "Show online status",
    showOnlineDesc: "Toggle activity indicator on your profile",
    autoApproveLabel: "Auto-approve follow requests",
    autoApproveDesc: "When off, new followers wait for your approval",
    allowMentionsLabel: "Allow @mentions",
    allowMentionsDesc: "Let others mention your @username in posts and comments",
    telegramNotifLabel: "Telegram bot notifications",
    telegramNotifDesc: "Requires starting the Telegram bot with /start first",
    emailNotifLabel: "Email notifications",
    emailNotifDesc: "For important security and system alerts",
    notifEventsTitle: "Notify me about",
    saveSettings: "Save settings",
    savedToast: "Settings saved",
    accountTitle: "Account settings",
    activeSession: "Active session",
    guest: "Guest",
    signInToManage: "Sign in to manage your Google or Telegram accounts.",
    connected: "Connected",
    notConnected: "Not connected",
    logoutCurrent: "Sign out of this device",
    logoutAll: "Sign out of all devices",
  },
  profile: {
    pageTitle: "Profile",
    loading: "Loading profile...",
    posts: "Posts",
    followers: "Followers",
    following: "Following",
    unlockedAvatars: "Unlocked avatars",
    dailyActivityTitle: "Daily activity & avatars",
    activeDayBadge: (d) => `Active day #${d}`,
    dailyActivityDesc: "Every day you are active unlocks +1 new avatar automatically. (Only visible to you)",
    activeDaysLabel: "Active days",
    profileAgeLabel: "Account age",
    avatarsLabel: "Avatars",
    daysUnit: "d",
    noPosts: "No published posts yet.",
    editProfile: "Edit",
    followRequests: (n) => `Follow requests (${n})`,
    approve: "Approve",
    guestBanner: "Sign in to unlock your personal profile, daily avatars, and all features.",
  },
  pages: {
    bookmarks: "Saved",
    notifications: "Notifications",
    messages: "Messages",
    help: "Help",
    admin: "Admin",
  },
};

const RU: AppTranslations = {
  nav: {
    feed: "Лента",
    search: "Поиск",
    compose: "Написать",
    menu: "Меню",
  },
  menu: {
    title: "Меню",
    profile: "Профиль",
    profileDesc: "Личная страница",
    notifications: "Уведомления",
    notificationsAllRead: "Всё прочитано",
    notificationsNew: (n) => `${n} новых`,
    bookmarks: "Сохранённые",
    bookmarksDesc: "Сохранённые посты",
    messages: "Сообщения",
    messagesDesc: "Личные переписки",
    settings: "Настройки",
    settingsDesc: "Язык, тема, приватность",
    admin: "Управление",
    help: "Помощь",
    helpDesc: "Справка и статус системы",
    signInPrompt: "Войдите, чтобы открыть профиль, посты и уведомления",
    signInPasswordBtn: "Войти по логину и паролю",
    setupPasswordBtn: "Установить логин и пароль",
    logout: "Выйти",
  },
  auth: {
    signIn: "Войти",
    signInTitle: "Вход в Avero",
    signInDesc: "Войдите по логину и паролю или продолжите через Google / Telegram.",
    usernameLabel: "Username",
    passwordLabel: "Пароль",
    passwordPlaceholder: "Введите пароль",
    loginWithUsername: "Войти по username",
    or: "или",
    loginWithGoogle: "Войти через Google",
    loginWithTelegram: "Войти через Telegram",
    setupTitle: "Настройте аккаунт",
    setupDesc: "Укажите username и пароль, чтобы в будущем входить напрямую по логину и паролю.",
    displayNameLabel: "Отображаемое имя (1–40 символов)",
    newPasswordLabel: "Пароль (минимум 6 символов)",
    confirmPasswordLabel: "Подтвердите пароль",
    bioLabel: "О себе (необязательно, до 150 символов)",
    suggestions: "Идеи",
    later: "Позже",
    save: "Сохранить",
    cancel: "Отмена",
  },
  feed: {
    forYou: "Для вас",
    following: "Подписки",
    trending: "Популярное",
    timeRange: "Период:",
    h24: "24 ч",
    d7: "7 дн",
    d30: "30 дн",
    writeBtn: "Написать",
    emptyFollowingGuest: "Войдите, чтобы видеть посты тех, на кого вы подписаны",
    emptyFollowing: "Вы пока ни на кого не подписаны",
    emptyAll: "Постов пока нет",
    emptyFollowingHint: "Найдите интересных авторов в поиске и подпишитесь.",
    emptyAllHint: "Напишите первый пост.",
    findPeople: "Найти авторов",
    writePost: "Написать пост",
  },
  post: {
    now: "Сейчас",
    min: "мин",
    hour: "ч",
    day: "дн",
    edited: "(изм.)",
    commentsTitle: (n) => `Комментарии (${n})`,
    commentPlaceholder: "Напишите комментарий...",
    replyPlaceholder: (u) => `Ответ @${u}...`,
    replyingTo: (u) => `Ответ @${u}`,
    commentsLoading: "Загрузка комментариев...",
    noComments: "Комментариев пока нет.",
    commentsClosed: "Автор отключил комментарии к этому посту.",
    commentsFollowersOnly: "Комментировать могут только подписчики автора.",
    reply: "Ответить",
    report: "Пожаловаться",
    delete: "Удалить",
    edit: "Изменить",
    bookmarkAdd: "Сохранить",
    bookmarkRemove: "Убрать из сохранённых",
    deleteForever: "Удалить навсегда",
    repostTitle: "Репост",
    repostDesc: "Выберите обычный репост или репост с комментарием.",
    simpleRepost: "Обычный репост",
    removeRepost: "Убрать репост",
    editTitle: "Редактировать пост",
    editDesc: "Сохраняется только последняя версия.",
    postTextLabel: "Текст поста",
    commentPolicyLabel: "Кто может комментировать",
    policyEveryone: "Все пользователи",
    policyFollowers: "Только подписчики",
    policyClosed: "Комментарии закрыты",
  },
  compose: {
    pageTitle: "Написать",
    newPost: "Новый пост",
    draftSaving: "Сохранение черновика...",
    draftSaved: "Черновик сохранён",
    limitLabel: (n) => `Лимит: ${n} симв.`,
    commentPolicyTitle: "Кто может комментировать?",
    placeholder: "Напишите ваши мысли... (#хештег можно писать прямо в тексте)",
    defaultHint: "Базовый лимит: 1000 символов. За каждого приглашённого друга +25 символов.",
    publish: "Опубликовать",
    privateDrafts: (n) => `Личные черновики (${n})`,
    onlyYouSee: "Видно только вам",
  },
  search: {
    pageTitle: "Поиск",
    placeholder: "Ищите пользователей, #хештеги или посты...",
    all: "Все",
    posts: "Посты",
    people: "Авторы",
    hashtags: "Хештеги",
    searching: "Поиск...",
    noResults: "Ничего не найдено.",
    clearFilter: "Сбросить фильтр",
    follow: "Подписаться",
    following: "Вы подписаны",
    requested: "Запрос отправлен",
  },
  settings: {
    pageTitle: "Настройки",
    appearanceTitle: "Внешний вид и язык",
    languageLabel: "Выбор языка",
    languageSheetTitle: "Выберите язык приложения",
    themeLabel: "Тёмная / Светлая тема",
    themeSystem: "Системная",
    themeDark: "OLED Dark",
    themeLight: "Pearl Light",
    privacyTitle: "Приватность и уведомления",
    privacyLevelLabel: "Уровень приватности (запросы на подписку)",
    privacyPublic: "Public (Открытая подписка)",
    privacyPublicDesc: "Посты публичны, любой может подписаться сразу",
    privacyPrivate: "Private (По одобрению)",
    privacyPrivateDesc: "Посты публичны, запросы на подписку подтверждаете вы",
    showOnlineLabel: "Показывать статус онлайн",
    showOnlineDesc: "Включить или скрыть индикатор активности в профиле",
    autoApproveLabel: "Автоматически одобрять подписки",
    autoApproveDesc: "Если выключено, новые подписчики ждут подтверждения",
    allowMentionsLabel: "Разрешить @упоминания",
    allowMentionsDesc: "Другие смогут отмечать ваш @username в постах и комментариях",
    telegramNotifLabel: "Уведомления в Telegram-боте",
    telegramNotifDesc: "Сначала нужно запустить бота командой /start",
    emailNotifLabel: "Email-уведомления",
    emailNotifDesc: "Для важных сообщений о безопасности",
    notifEventsTitle: "О каких событиях уведомлять",
    saveSettings: "Сохранить настройки",
    savedToast: "Настройки сохранены",
    accountTitle: "Настройки аккаунта",
    activeSession: "Активная сессия",
    guest: "Гость",
    signInToManage: "Войдите, чтобы управлять аккаунтами Google или Telegram.",
    connected: "Подключён",
    notConnected: "Не подключён",
    logoutCurrent: "Выйти на этом устройстве",
    logoutAll: "Выйти со всех устройств",
  },
  profile: {
    pageTitle: "Профиль",
    loading: "Загрузка профиля...",
    posts: "Посты",
    followers: "Подписчики",
    following: "Подписки",
    unlockedAvatars: "Открытые аватары",
    dailyActivityTitle: "Ежедневная активность и аватары",
    activeDayBadge: (d) => `${d}-й активный день`,
    dailyActivityDesc: "Каждый активный день автоматически открывает +1 новый аватар. (Видно только вам)",
    activeDaysLabel: "Активные дни",
    profileAgeLabel: "Возраст профиля",
    avatarsLabel: "Аватары",
    daysUnit: "дн",
    noPosts: "Опубликованных постов пока нет.",
    editProfile: "Изменить",
    followRequests: (n) => `Запросы на подписку (${n})`,
    approve: "Принять",
    guestBanner: "Войдите, чтобы открыть личный профиль, ежедневные аватары и все функции.",
  },
  pages: {
    bookmarks: "Сохранённые",
    notifications: "Уведомления",
    messages: "Сообщения",
    help: "Помощь",
    admin: "Управление",
  },
};

const DICTIONARIES: Record<AppLanguage, AppTranslations> = {
  uz: UZ,
  en: EN,
  ru: RU,
};

export function getTranslations(lang: AppLanguage): AppTranslations {
  return DICTIONARIES[lang] ?? UZ;
}
