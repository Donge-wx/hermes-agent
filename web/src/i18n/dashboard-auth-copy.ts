import type { Locale } from "./types";


export interface DashboardAuthCopy {
  loggedInAs: string;
  logout: string;
  statusUnavailable: string;
  via: string;
}


export const DASHBOARD_AUTH_COPY: Record<Locale, DashboardAuthCopy> = {
  en: {
    loggedInAs: "Logged in as {name}",
    logout: "Log out",
    statusUnavailable: "Authentication status unavailable",
    via: "via",
  },
  zh: {
    loggedInAs: "已登录：{name}",
    logout: "退出登录",
    statusUnavailable: "暂时无法读取登录状态",
    via: "通过",
  },
  "zh-hant": {
    loggedInAs: "已登入：{name}",
    logout: "登出",
    statusUnavailable: "暫時無法讀取登入狀態",
    via: "透過",
  },
  ja: {
    loggedInAs: "{name} としてログイン中",
    logout: "ログアウト",
    statusUnavailable: "認証状態を取得できません",
    via: "経由",
  },
  de: {
    loggedInAs: "Angemeldet als {name}",
    logout: "Abmelden",
    statusUnavailable: "Authentifizierungsstatus nicht verfügbar",
    via: "über",
  },
  es: {
    loggedInAs: "Sesión iniciada como {name}",
    logout: "Cerrar sesión",
    statusUnavailable: "Estado de autenticación no disponible",
    via: "mediante",
  },
  fr: {
    loggedInAs: "Connecté en tant que {name}",
    logout: "Se déconnecter",
    statusUnavailable: "État d’authentification indisponible",
    via: "via",
  },
  tr: {
    loggedInAs: "{name} olarak oturum açıldı",
    logout: "Oturumu kapat",
    statusUnavailable: "Kimlik doğrulama durumu kullanılamıyor",
    via: "üzerinden",
  },
  uk: {
    loggedInAs: "Вхід виконано як {name}",
    logout: "Вийти",
    statusUnavailable: "Стан автентифікації недоступний",
    via: "через",
  },
  af: {
    loggedInAs: "Aangemeld as {name}",
    logout: "Meld af",
    statusUnavailable: "Stawingstatus is nie beskikbaar nie",
    via: "via",
  },
  ko: {
    loggedInAs: "{name}(으)로 로그인됨",
    logout: "로그아웃",
    statusUnavailable: "인증 상태를 확인할 수 없습니다",
    via: "경유",
  },
  it: {
    loggedInAs: "Accesso effettuato come {name}",
    logout: "Esci",
    statusUnavailable: "Stato di autenticazione non disponibile",
    via: "tramite",
  },
  ga: {
    loggedInAs: "Sínithe isteach mar {name}",
    logout: "Sínigh amach",
    statusUnavailable: "Níl stádas fíordheimhnithe ar fáil",
    via: "trí",
  },
  pt: {
    loggedInAs: "Sessão iniciada como {name}",
    logout: "Terminar sessão",
    statusUnavailable: "Estado de autenticação indisponível",
    via: "por",
  },
  ru: {
    loggedInAs: "Выполнен вход: {name}",
    logout: "Выйти",
    statusUnavailable: "Статус аутентификации недоступен",
    via: "через",
  },
  hu: {
    loggedInAs: "Bejelentkezve mint {name}",
    logout: "Kijelentkezés",
    statusUnavailable: "A hitelesítési állapot nem érhető el",
    via: "ezzel",
  },
  ar: {
    loggedInAs: "تم تسجيل الدخول باسم {name}",
    logout: "تسجيل الخروج",
    statusUnavailable: "حالة المصادقة غير متاحة",
    via: "عبر",
  },
};


export function formatAuthCopy(template: string, name: string): string {
  return template.replace("{name}", name);
}
