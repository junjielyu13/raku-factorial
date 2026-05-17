// src/i18n/messages.ts
// All translatable strings, keyed by language. Add a new language by adding a new entry.

export type Lang = 'zh' | 'en' | 'es';

export const LANGS: { code: Lang; label: string }[] = [
  { code: 'zh', label: '中文' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
];

export const LOCALE: Record<Lang, string> = {
  zh: 'zh-CN',
  en: 'en-GB',
  es: 'es-ES',
};

interface Messages {
  common: {
    back: string;
    loading: string;
  };
  login: {
    title: string;
    email: string;
    password: string;
    submit: string;
    submitting: string;
    invalidCredentials: string;
  };
  auth: {
    notRegistered: string;
    logout: string;
  };
  punch: {
    in: string;
    out: string;
    punchIn: string;
    punchOut: string;
    errors: Record<string, string>;
  };
  home: {
    todayLabel: string;
    noPunchYet: string;
    myHistory: string;
    submitEdit: string;
    adminLink: string;
  };
  history: {
    title: string;
    noRecords: string;
  };
  editRequest: {
    title: string;
    type: string;
    actualTime: string;
    reason: string;
    submit: string;
    submitting: string;
    errors: Record<string, string>;
  };
  admin: {
    todayTitle: string;
    approvalsLink: string;
    exportLink: string;
    employeeViewLink: string;
    noPunchesToday: string;
    noGps: string;
    distanceFromOffice: string; // uses {distance}
    approvals: {
      title: string;
      none: string;
      approve: string;
      reject: string;
      requestLabel: string;
      reasonLabel: string;
      approveFailed: string; // uses {code}
      rejectFailed: string;  // uses {code}
    };
    export: {
      title: string;
      monthLabel: string;
      download: string;
      generating: string;
      failed: string;        // uses {code}
    };
  };
  language: {
    label: string;
  };
}

export const MESSAGES: Record<Lang, Messages> = {
  zh: {
    common: { back: '← 返回', loading: '加载中…' },
    login: {
      title: '登录',
      email: '邮箱',
      password: '密码',
      submit: '登录',
      submitting: '登录中…',
      invalidCredentials: '邮箱或密码不正确。',
    },
    auth: { notRegistered: '账号未在系统注册，请联系管理员。', logout: '退出' },
    punch: {
      in: '上班',
      out: '下班',
      punchIn: '上班打卡',
      punchOut: '下班打卡',
      errors: {
        PERMISSION_DENIED: '需要位置权限才能打卡。请在浏览器设置里允许定位后重试。',
        UNAVAILABLE: '无法获取定位。请到窗边或开启 GPS 后重试。',
        TIMEOUT: '定位超时，请重试。',
        NO_GEOLOCATION: '当前浏览器不支持定位。',
        GPS_REQUIRED: '必须提供 GPS 坐标才能打卡。',
        TOO_SOON: '刚打过卡了，请稍等一会再试。',
        INVALID_SEQUENCE: '打卡顺序不对（上班/下班）。如有问题请提交补卡申请。',
        MISSING_AUTH: '请重新登录。',
        INVALID_JWT: '请重新登录。',
        NOT_EMPLOYEE: '账号未在系统注册，请联系管理员。',
        INACTIVE: '账号已停用。',
        UNKNOWN: '打卡失败：{code}',
      },
    },
    home: {
      todayLabel: '今天',
      noPunchYet: '还没打卡',
      myHistory: '我的历史',
      submitEdit: '补卡申请',
      adminLink: '管理',
    },
    history: { title: '最近 30 天', noRecords: '暂无记录' },
    editRequest: {
      title: '补卡申请',
      type: '类型',
      actualTime: '实际时间',
      reason: '原因',
      submit: '提交',
      submitting: '提交中…',
      errors: {
        FUTURE_TIME: '时间不能是未来。',
        BAD_REASON: '原因不能为空。',
        BAD_TIME: '时间格式不正确。',
        BAD_KIND: '类型不正确。',
        UNKNOWN: '提交失败：{code}',
      },
    },
    admin: {
      todayTitle: '今日打卡',
      approvalsLink: '审批',
      exportLink: '导出',
      employeeViewLink: '员工视图',
      noPunchesToday: '今天还没人打卡',
      noGps: '📍 无 GPS 数据',
      distanceFromOffice: '距离办公点 {distance}',
      approvals: {
        title: '待审批的补卡申请',
        none: '没有待审批的申请',
        approve: '通过',
        reject: '拒绝',
        requestLabel: '请求：',
        reasonLabel: '原因：',
        approveFailed: '通过失败：{code}',
        rejectFailed: '拒绝失败：{code}',
      },
      export: {
        title: '导出月度 CSV',
        monthLabel: '月份 (YYYY-MM)',
        download: '下载 CSV',
        generating: '生成中…',
        failed: '导出失败：{code}',
      },
    },
    language: { label: '语言' },
  },
  en: {
    common: { back: '← Back', loading: 'Loading…' },
    login: {
      title: 'Log in',
      email: 'Email',
      password: 'Password',
      submit: 'Log in',
      submitting: 'Logging in…',
      invalidCredentials: 'Invalid email or password.',
    },
    auth: { notRegistered: 'Account not registered. Please contact admin.', logout: 'Log out' },
    punch: {
      in: 'Clock in',
      out: 'Clock out',
      punchIn: 'Clock in',
      punchOut: 'Clock out',
      errors: {
        PERMISSION_DENIED: 'Location permission required. Please allow location in your browser and retry.',
        UNAVAILABLE: 'Unable to get location. Move near a window or enable GPS and retry.',
        TIMEOUT: 'Location request timed out. Please retry.',
        NO_GEOLOCATION: 'Your browser does not support geolocation.',
        GPS_REQUIRED: 'GPS coordinates are required to clock in/out.',
        TOO_SOON: 'You just punched. Please wait a moment.',
        INVALID_SEQUENCE: 'Punch order is wrong (clock in / out). Submit a correction request if needed.',
        MISSING_AUTH: 'Please log in again.',
        INVALID_JWT: 'Please log in again.',
        NOT_EMPLOYEE: 'Account not registered. Please contact admin.',
        INACTIVE: 'Account is deactivated.',
        UNKNOWN: 'Punch failed: {code}',
      },
    },
    home: {
      todayLabel: 'Today',
      noPunchYet: 'No punches yet today',
      myHistory: 'My history',
      submitEdit: 'Request correction',
      adminLink: 'Admin',
    },
    history: { title: 'Last 30 days', noRecords: 'No records' },
    editRequest: {
      title: 'Punch correction request',
      type: 'Type',
      actualTime: 'Actual time',
      reason: 'Reason',
      submit: 'Submit',
      submitting: 'Submitting…',
      errors: {
        FUTURE_TIME: 'Time cannot be in the future.',
        BAD_REASON: 'Reason is required.',
        BAD_TIME: 'Invalid time format.',
        BAD_KIND: 'Invalid type.',
        UNKNOWN: 'Submit failed: {code}',
      },
    },
    admin: {
      todayTitle: "Today's punches",
      approvalsLink: 'Approvals',
      exportLink: 'Export',
      employeeViewLink: 'Employee view',
      noPunchesToday: 'No punches today',
      noGps: '📍 No GPS data',
      distanceFromOffice: '{distance} from office',
      approvals: {
        title: 'Pending correction requests',
        none: 'No pending requests',
        approve: 'Approve',
        reject: 'Reject',
        requestLabel: 'Request: ',
        reasonLabel: 'Reason: ',
        approveFailed: 'Approve failed: {code}',
        rejectFailed: 'Reject failed: {code}',
      },
      export: {
        title: 'Export monthly CSV',
        monthLabel: 'Month (YYYY-MM)',
        download: 'Download CSV',
        generating: 'Generating…',
        failed: 'Export failed: {code}',
      },
    },
    language: { label: 'Language' },
  },
  es: {
    common: { back: '← Volver', loading: 'Cargando…' },
    login: {
      title: 'Iniciar sesión',
      email: 'Correo electrónico',
      password: 'Contraseña',
      submit: 'Iniciar sesión',
      submitting: 'Iniciando…',
      invalidCredentials: 'Correo o contraseña incorrectos.',
    },
    auth: { notRegistered: 'Cuenta no registrada. Contacta con el administrador.', logout: 'Cerrar sesión' },
    punch: {
      in: 'Entrada',
      out: 'Salida',
      punchIn: 'Fichar entrada',
      punchOut: 'Fichar salida',
      errors: {
        PERMISSION_DENIED: 'Se requiere permiso de ubicación. Permítelo en el navegador e inténtalo de nuevo.',
        UNAVAILABLE: 'No se pudo obtener la ubicación. Acércate a una ventana o activa el GPS.',
        TIMEOUT: 'Tiempo de espera de la ubicación agotado. Inténtalo de nuevo.',
        NO_GEOLOCATION: 'El navegador no soporta geolocalización.',
        GPS_REQUIRED: 'Se requieren coordenadas GPS para fichar.',
        TOO_SOON: 'Acabas de fichar. Espera un momento.',
        INVALID_SEQUENCE: 'Orden de fichaje incorrecto (entrada/salida). Envía una corrección si hace falta.',
        MISSING_AUTH: 'Vuelve a iniciar sesión.',
        INVALID_JWT: 'Vuelve a iniciar sesión.',
        NOT_EMPLOYEE: 'Cuenta no registrada. Contacta con el administrador.',
        INACTIVE: 'Cuenta desactivada.',
        UNKNOWN: 'Fichaje fallido: {code}',
      },
    },
    home: {
      todayLabel: 'Hoy',
      noPunchYet: 'Aún no has fichado',
      myHistory: 'Mi historial',
      submitEdit: 'Solicitar corrección',
      adminLink: 'Administración',
    },
    history: { title: 'Últimos 30 días', noRecords: 'Sin registros' },
    editRequest: {
      title: 'Solicitud de corrección',
      type: 'Tipo',
      actualTime: 'Hora real',
      reason: 'Motivo',
      submit: 'Enviar',
      submitting: 'Enviando…',
      errors: {
        FUTURE_TIME: 'La hora no puede ser futura.',
        BAD_REASON: 'El motivo es obligatorio.',
        BAD_TIME: 'Formato de hora no válido.',
        BAD_KIND: 'Tipo no válido.',
        UNKNOWN: 'Envío fallido: {code}',
      },
    },
    admin: {
      todayTitle: 'Fichajes de hoy',
      approvalsLink: 'Aprobaciones',
      exportLink: 'Exportar',
      employeeViewLink: 'Vista empleado',
      noPunchesToday: 'Sin fichajes hoy',
      noGps: '📍 Sin datos GPS',
      distanceFromOffice: '{distance} de la oficina',
      approvals: {
        title: 'Solicitudes pendientes',
        none: 'No hay solicitudes pendientes',
        approve: 'Aprobar',
        reject: 'Rechazar',
        requestLabel: 'Solicitud: ',
        reasonLabel: 'Motivo: ',
        approveFailed: 'Error al aprobar: {code}',
        rejectFailed: 'Error al rechazar: {code}',
      },
      export: {
        title: 'Exportar CSV mensual',
        monthLabel: 'Mes (AAAA-MM)',
        download: 'Descargar CSV',
        generating: 'Generando…',
        failed: 'Exportación fallida: {code}',
      },
    },
    language: { label: 'Idioma' },
  },
};
