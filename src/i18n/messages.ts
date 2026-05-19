// src/i18n/messages.ts
// All translatable strings, keyed by language. Add a new language by adding a new entry.

export type Lang = 'zh' | 'en' | 'es';

// Display order of the language picker: Spanish, Chinese, English.
export const LANGS: { code: Lang; label: string }[] = [
  { code: 'es', label: 'Español' },
  { code: 'zh', label: '中文' },
  { code: 'en', label: 'English' },
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
    pagination: {
      perPage: string;
      prev: string;
      next: string;
      pageOf: string;    // uses {page}, {total}
    };
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
    todayTotal: string;     // uses {h}, {m}
    noPunchYet: string;
    myHistory: string;
    submitEdit: string;
    adminLink: string;
    statusOn: string;       // uses {time}
    statusOff: string;
  };
  history: {
    title: string;
    noRecords: string;
    filter: {
      last7: string;
      last30: string;
      day: string;
    };
    pickDate: string;
    total: string;       // uses {h}, {m}
    rangeTotal: string;  // uses {h}, {m}
    pendingToggle: string;
    deleteLabel: string;
  };
  editRequest: {
    title: string;
    type: string;
    actualTime: string;
    reason: string;
    submit: string;
    submitting: string;
    requestModifyTitle: string;
    requestDeleteTitle: string;
    requestAddTitle: string;
    requestModifyAction: string;
    requestDeleteAction: string;
    requestAddAction: string;
    cancel: string;
    pendingHint: string;
    errors: Record<string, string>;
  };
  myRequests: {
    title: string;
    button: string;
    none: string;
    submittedAt: string; // uses {time}
    status: {
      pending: string;
      approved: string;
      rejected: string;
      superseded: string;
    };
  };
  admin: {
    todayTitle: string;
    approvalsLink: string;
    exportLink: string;
    employeeViewLink: string;
    noPunchesToday: string;
    dateLabel: string;
    noGps: string;
    distanceFromOffice: string; // uses {distance}
    abnormalTimeIn: string;
    abnormalTimeOut: string;
    warningsExpand: string;
    warningsCollapse: string;
    filterAll: string;
    filterLabel: string;
    rangeLabel: string;
    range: {
      day: string;
      last7: string;
      last30: string;
      custom: string;
    };
    fromLabel: string;
    toLabel: string;
    stats: {
      title: string;
      total: string;  // uses {h}, {m}
      hours: string;  // uses {h}, {m}
    };
    noPunchesRange: string;
    table: {
      time: string;
      person: string;
      status: string;
      info: string;
      warn: string;
      actions: string;
    };
    shifts: {
      dateCol: string;
      inCol: string;
      outCol: string;
      durationCol: string;
      openShift: string;
      strayOut: string;
    };
    approvals: {
      title: string;
      none: string;
      approve: string;
      reject: string;
      requestLabel: string;
      reasonLabel: string;
      approveFailed: string; // uses {code}
      rejectFailed: string;  // uses {code}
      pendingBadge: string;  // uses {count}
      action: { add: string; modify: string; delete: string };
      originalLabel: string;
      requestedLabel: string;
      targetLabel: string;
    };
    export: {
      title: string;
      monthLabel: string;
      download: string;
      generating: string;
      failed: string;        // uses {code}
    };
    correct: {
      modify: string;
      delete: string;
      addPunch: string;
      modalAddTitle: string;
      modalModifyTitle: string;
      modalDeleteTitle: string;
      employeeLabel: string;
      typeLabel: string;
      timeLabel: string;
      reasonLabel: string;
      reasonPlaceholder: string;
      selectEmployee: string;
      save: string;
      saving: string;
      cancel: string;
      confirmDelete: string;
      correctedBadge: string;
      errors: Record<string, string>;
    };
    rules: {
      button: string;
      title: string;
      timeTitle: string;
      inLabel: string;
      outLabel: string;
      locationTitle: string;
      locationDesc: string; // uses {distance}
      close: string;
    };
    corrections: {
      button: string;
      title: string;
      none: string;
      byAdmin: string;       // uses {admin}, {time}
      submittedBy: string;   // uses {name}, {time}
      reviewedBy: string;    // uses {name}, {time}
      truncated: string;     // uses {count}
    };
  };
  language: {
    label: string;
  };
}

export const MESSAGES: Record<Lang, Messages> = {
  zh: {
    common: {
      back: '← 返回',
      loading: '加载中…',
      pagination: { perPage: '每页', prev: '上一页', next: '下一页', pageOf: '第 {page} / {total} 页' },
    },
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
      todayTotal: '共 {h} 小时 {m} 分',
      noPunchYet: '还没打卡',
      myHistory: '我的历史',
      submitEdit: '补卡申请',
      adminLink: '管理',
      statusOn: '上班中 · 从 {time}',
      statusOff: '未上班',
    },
    history: {
      title: '打卡历史',
      noRecords: '暂无记录',
      filter: { last7: '近 7 天', last30: '近 30 天', day: '某一天' },
      pickDate: '选择日期',
      total: '共 {h} 小时 {m} 分',
      rangeTotal: '合计 {h} 小时 {m} 分',
      pendingToggle: '查看待审批申请',
      deleteLabel: '删除',
    },
    editRequest: {
      title: '补卡申请',
      type: '类型',
      actualTime: '实际时间',
      reason: '原因',
      submit: '提交',
      submitting: '提交中…',
      requestModifyTitle: '申请修改打卡时间',
      requestDeleteTitle: '申请删除打卡',
      requestAddTitle: '申请补打卡',
      requestModifyAction: '提交修改申请',
      requestDeleteAction: '提交删除申请',
      requestAddAction: '提交补卡申请',
      cancel: '取消',
      pendingHint: '提交后需等待管理员审批。',
      errors: {
        FUTURE_TIME: '时间不能是未来。',
        BAD_REASON: '原因不能为空。',
        BAD_TIME: '时间格式不正确。',
        BAD_KIND: '类型不正确。',
        BAD_ACTION: '操作类型不正确。',
        BAD_TARGET: '未找到目标打卡。',
        TARGET_NOT_FOUND: '未找到目标打卡。',
        NOT_OWNER: '只能申请修改自己的打卡。',
        ALREADY_SUPERSEDED: '这条打卡已被修改过，请刷新后重试。',
        UNKNOWN: '提交失败：{code}',
      },
    },
    myRequests: {
      title: '我的申请',
      button: '我的申请',
      none: '暂无申请',
      submittedAt: '提交于 {time}',
      status: {
        pending: '待审批',
        approved: '已通过',
        rejected: '已拒绝',
        superseded: '已被新申请替代',
      },
    },
    admin: {
      todayTitle: '打卡记录',
      dateLabel: '日期',
      approvalsLink: '审批',
      exportLink: '导出',
      employeeViewLink: '员工视图',
      noPunchesToday: '今天还没人打卡',
      noGps: '📍 无 GPS 数据',
      distanceFromOffice: '距离办公点 {distance}',
      abnormalTimeIn: '上班时间不正常',
      abnormalTimeOut: '下班时间不正常',
      warningsExpand: '查看警告',
      warningsCollapse: '收起',
      filterAll: '全部员工',
      filterLabel: '员工筛选',
      rangeLabel: '范围',
      range: { day: '某一天', last7: '近 7 天', last30: '近 30 天', custom: '自定义' },
      fromLabel: '从',
      toLabel: '到',
      stats: {
        title: '工时统计',
        total: '合计 {h} 小时 {m} 分',
        hours: '{h} 小时 {m} 分',
      },
      noPunchesRange: '该范围内没有打卡记录',
      table: {
        time: '时间',
        person: '员工',
        status: '状态',
        info: '其他信息',
        warn: '⚠️',
        actions: '操作',
      },
      shifts: {
        dateCol: '日期',
        inCol: '上班',
        outCol: '下班',
        durationCol: '时长',
        openShift: '未下班',
        strayOut: '未上班',
      },
      approvals: {
        title: '待审批的补卡申请',
        none: '没有待审批的申请',
        approve: '通过',
        reject: '拒绝',
        requestLabel: '请求：',
        reasonLabel: '原因：',
        approveFailed: '通过失败：{code}',
        rejectFailed: '拒绝失败：{code}',
        pendingBadge: '{count} 个待审批',
        action: { add: '新增', modify: '修改', delete: '删除' },
        originalLabel: '原时间：',
        requestedLabel: '申请时间：',
        targetLabel: '目标记录：',
      },
      export: {
        title: '导出月度 CSV',
        monthLabel: '月份 (YYYY-MM)',
        download: '下载 CSV',
        generating: '生成中…',
        failed: '导出失败：{code}',
      },
      correct: {
        modify: '修改',
        delete: '删除',
        addPunch: '补登打卡',
        modalAddTitle: '补登打卡',
        modalModifyTitle: '修改打卡',
        modalDeleteTitle: '删除打卡',
        employeeLabel: '员工',
        typeLabel: '类型',
        timeLabel: '时间',
        reasonLabel: '原因',
        reasonPlaceholder: '请填写修正原因（审计留存）',
        selectEmployee: '选择员工',
        save: '保存',
        saving: '保存中…',
        cancel: '取消',
        confirmDelete: '确认删除',
        correctedBadge: '已修正',
        errors: {
          BAD_ACTION: '操作类型不正确。',
          BAD_REASON: '原因不能为空。',
          BAD_KIND: '类型不正确。',
          BAD_TIME: '时间格式不正确。',
          FUTURE_TIME: '时间不能是未来。',
          BAD_EMPLOYEE: '请选择员工。',
          BAD_TARGET: '未找到目标打卡。',
          ALREADY_CHANGED: '这条打卡已被修改过，请刷新后重试。',
          NOT_FOUND: '未找到目标打卡。',
          NOT_ADMIN: '需要管理员权限。',
          UNKNOWN: '操作失败：{code}',
        },
      },
      rules: {
        button: '打卡规则',
        title: '打卡规则',
        timeTitle: '打卡时间',
        inLabel: '上班',
        outLabel: '下班',
        locationTitle: '打卡位置',
        locationDesc: '需在距离办公点 {distance} 以内',
        close: '关闭',
      },
      corrections: {
        button: '修改记录',
        title: '打卡修改记录',
        none: '没有修改记录',
        byAdmin: '管理员 {admin} 直接修改 · {time}',
        submittedBy: '由 {name} 提交 · {time}',
        reviewedBy: '由 {name} 审批 · {time}',
        truncated: '仅显示最近 {count} 条',
      },
    },
    language: { label: '语言' },
  },
  en: {
    common: {
      back: '← Back',
      loading: 'Loading…',
      pagination: { perPage: 'Per page', prev: 'Previous', next: 'Next', pageOf: 'Page {page} of {total}' },
    },
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
      todayTotal: 'Total {h}h {m}m',
      noPunchYet: 'No punches yet today',
      myHistory: 'My history',
      submitEdit: 'Request correction',
      adminLink: 'Admin',
      statusOn: 'Clocked in since {time}',
      statusOff: 'Not clocked in',
    },
    history: {
      title: 'History',
      noRecords: 'No records',
      filter: { last7: 'Last 7 days', last30: 'Last 30 days', day: 'Pick a day' },
      pickDate: 'Pick date',
      total: 'Total {h}h {m}m',
      rangeTotal: 'Total {h}h {m}m',
      pendingToggle: 'Show pending request',
      deleteLabel: 'Delete',
    },
    editRequest: {
      title: 'Punch correction request',
      type: 'Type',
      actualTime: 'Actual time',
      reason: 'Reason',
      submit: 'Submit',
      submitting: 'Submitting…',
      requestModifyTitle: 'Request time change',
      requestDeleteTitle: 'Request punch deletion',
      requestAddTitle: 'Request missing punch',
      requestModifyAction: 'Submit change request',
      requestDeleteAction: 'Submit deletion request',
      requestAddAction: 'Submit add request',
      cancel: 'Cancel',
      pendingHint: 'Your request will await admin approval.',
      errors: {
        FUTURE_TIME: 'Time cannot be in the future.',
        BAD_REASON: 'Reason is required.',
        BAD_TIME: 'Invalid time format.',
        BAD_KIND: 'Invalid type.',
        BAD_ACTION: 'Invalid action.',
        BAD_TARGET: 'Target punch not found.',
        TARGET_NOT_FOUND: 'Target punch not found.',
        NOT_OWNER: 'You can only request changes to your own punches.',
        ALREADY_SUPERSEDED: 'This punch was already corrected. Refresh and try again.',
        UNKNOWN: 'Submit failed: {code}',
      },
    },
    myRequests: {
      title: 'My requests',
      button: 'My requests',
      none: 'No requests',
      submittedAt: 'Submitted {time}',
      status: {
        pending: 'Pending',
        approved: 'Approved',
        rejected: 'Rejected',
        superseded: 'Replaced',
      },
    },
    admin: {
      todayTitle: 'Punches',
      dateLabel: 'Date',
      approvalsLink: 'Approvals',
      exportLink: 'Export',
      employeeViewLink: 'Employee view',
      noPunchesToday: 'No punches today',
      noGps: '📍 No GPS data',
      distanceFromOffice: '{distance} from office',
      abnormalTimeIn: 'Unusual clock-in time',
      abnormalTimeOut: 'Unusual clock-out time',
      warningsExpand: 'Show warnings',
      warningsCollapse: 'Collapse',
      filterAll: 'All employees',
      filterLabel: 'Filter by employee',
      rangeLabel: 'Range',
      range: { day: 'Single day', last7: 'Last 7 days', last30: 'Last 30 days', custom: 'Custom' },
      fromLabel: 'From',
      toLabel: 'To',
      stats: {
        title: 'Hours worked',
        total: 'Total {h}h {m}m',
        hours: '{h}h {m}m',
      },
      noPunchesRange: 'No punches in this range',
      table: {
        time: 'Time',
        person: 'Employee',
        status: 'Status',
        info: 'Details',
        warn: '⚠️',
        actions: 'Actions',
      },
      shifts: {
        dateCol: 'Date',
        inCol: 'Clock in',
        outCol: 'Clock out',
        durationCol: 'Duration',
        openShift: 'Not clocked out',
        strayOut: 'Not clocked in',
      },
      approvals: {
        title: 'Pending correction requests',
        none: 'No pending requests',
        approve: 'Approve',
        reject: 'Reject',
        requestLabel: 'Request: ',
        reasonLabel: 'Reason: ',
        approveFailed: 'Approve failed: {code}',
        rejectFailed: 'Reject failed: {code}',
        pendingBadge: '{count} pending',
        action: { add: 'Add', modify: 'Modify', delete: 'Delete' },
        originalLabel: 'Original:',
        requestedLabel: 'Requested:',
        targetLabel: 'Target:',
      },
      export: {
        title: 'Export monthly CSV',
        monthLabel: 'Month (YYYY-MM)',
        download: 'Download CSV',
        generating: 'Generating…',
        failed: 'Export failed: {code}',
      },
      correct: {
        modify: 'Modify',
        delete: 'Delete',
        addPunch: 'Add punch',
        modalAddTitle: 'Add punch',
        modalModifyTitle: 'Modify punch',
        modalDeleteTitle: 'Delete punch',
        employeeLabel: 'Employee',
        typeLabel: 'Type',
        timeLabel: 'Time',
        reasonLabel: 'Reason',
        reasonPlaceholder: 'Reason for the correction (kept for audit)',
        selectEmployee: 'Select employee',
        save: 'Save',
        saving: 'Saving…',
        cancel: 'Cancel',
        confirmDelete: 'Confirm delete',
        correctedBadge: 'corrected',
        errors: {
          BAD_ACTION: 'Invalid action.',
          BAD_REASON: 'Reason is required.',
          BAD_KIND: 'Invalid type.',
          BAD_TIME: 'Invalid time format.',
          FUTURE_TIME: 'Time cannot be in the future.',
          BAD_EMPLOYEE: 'Please select an employee.',
          BAD_TARGET: 'Target punch not found.',
          ALREADY_CHANGED: 'This punch was already changed. Refresh and retry.',
          NOT_FOUND: 'Target punch not found.',
          NOT_ADMIN: 'Admin privileges required.',
          UNKNOWN: 'Action failed: {code}',
        },
      },
      rules: {
        button: 'Punch rules',
        title: 'Punch rules',
        timeTitle: 'Punch time',
        inLabel: 'Clock in',
        outLabel: 'Clock out',
        locationTitle: 'Punch location',
        locationDesc: 'Must be within {distance} of an office',
        close: 'Close',
      },
      corrections: {
        button: 'Corrections log',
        title: 'Punch corrections log',
        none: 'No corrections yet',
        byAdmin: 'Direct admin change by {admin} · {time}',
        submittedBy: 'Submitted by {name} · {time}',
        reviewedBy: 'Reviewed by {name} · {time}',
        truncated: 'Showing the most recent {count}',
      },
    },
    language: { label: 'Language' },
  },
  es: {
    common: {
      back: '← Volver',
      loading: 'Cargando…',
      pagination: { perPage: 'Por página', prev: 'Anterior', next: 'Siguiente', pageOf: 'Página {page} de {total}' },
    },
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
      todayTotal: 'Total {h} h {m} min',
      noPunchYet: 'Aún no has fichado',
      myHistory: 'Mi historial',
      submitEdit: 'Solicitar corrección',
      adminLink: 'Administración',
      statusOn: 'Fichado desde las {time}',
      statusOff: 'Sin fichar',
    },
    history: {
      title: 'Historial',
      noRecords: 'Sin registros',
      filter: { last7: 'Últimos 7 días', last30: 'Últimos 30 días', day: 'Un día' },
      pickDate: 'Elegir fecha',
      total: 'Total {h} h {m} min',
      rangeTotal: 'Total {h} h {m} min',
      pendingToggle: 'Ver solicitud pendiente',
      deleteLabel: 'Borrar',
    },
    editRequest: {
      title: 'Solicitud de corrección',
      type: 'Tipo',
      actualTime: 'Hora real',
      reason: 'Motivo',
      submit: 'Enviar',
      submitting: 'Enviando…',
      requestModifyTitle: 'Solicitar cambio de hora',
      requestDeleteTitle: 'Solicitar borrado del fichaje',
      requestAddTitle: 'Solicitar fichaje faltante',
      requestModifyAction: 'Enviar solicitud de cambio',
      requestDeleteAction: 'Enviar solicitud de borrado',
      requestAddAction: 'Enviar solicitud de fichaje',
      cancel: 'Cancelar',
      pendingHint: 'La solicitud quedará pendiente de aprobación.',
      errors: {
        FUTURE_TIME: 'La hora no puede ser futura.',
        BAD_REASON: 'El motivo es obligatorio.',
        BAD_TIME: 'Formato de hora no válido.',
        BAD_KIND: 'Tipo no válido.',
        BAD_ACTION: 'Acción no válida.',
        BAD_TARGET: 'No se encuentra el fichaje.',
        TARGET_NOT_FOUND: 'No se encuentra el fichaje.',
        NOT_OWNER: 'Solo puedes solicitar cambios en tus propios fichajes.',
        ALREADY_SUPERSEDED: 'Este fichaje ya fue corregido. Actualiza y vuelve a intentarlo.',
        UNKNOWN: 'Envío fallido: {code}',
      },
    },
    myRequests: {
      title: 'Mis solicitudes',
      button: 'Mis solicitudes',
      none: 'Sin solicitudes',
      submittedAt: 'Enviada {time}',
      status: {
        pending: 'Pendiente',
        approved: 'Aprobada',
        rejected: 'Rechazada',
        superseded: 'Reemplazada',
      },
    },
    admin: {
      todayTitle: 'Fichajes',
      dateLabel: 'Fecha',
      approvalsLink: 'Aprobaciones',
      exportLink: 'Exportar',
      employeeViewLink: 'Vista empleado',
      noPunchesToday: 'Sin fichajes hoy',
      noGps: '📍 Sin datos GPS',
      distanceFromOffice: '{distance} de la oficina',
      abnormalTimeIn: 'Hora de entrada inusual',
      abnormalTimeOut: 'Hora de salida inusual',
      warningsExpand: 'Ver avisos',
      warningsCollapse: 'Contraer',
      filterAll: 'Todos los empleados',
      filterLabel: 'Filtrar por empleado',
      rangeLabel: 'Rango',
      range: { day: 'Un día', last7: 'Últimos 7 días', last30: 'Últimos 30 días', custom: 'Personalizado' },
      fromLabel: 'Desde',
      toLabel: 'Hasta',
      stats: {
        title: 'Horas trabajadas',
        total: 'Total {h} h {m} min',
        hours: '{h} h {m} min',
      },
      noPunchesRange: 'Sin fichajes en este rango',
      table: {
        time: 'Hora',
        person: 'Empleado',
        status: 'Estado',
        info: 'Detalles',
        warn: '⚠️',
        actions: 'Acciones',
      },
      shifts: {
        dateCol: 'Fecha',
        inCol: 'Entrada',
        outCol: 'Salida',
        durationCol: 'Duración',
        openShift: 'Sin salida',
        strayOut: 'Sin entrada',
      },
      approvals: {
        title: 'Solicitudes pendientes',
        none: 'No hay solicitudes pendientes',
        approve: 'Aprobar',
        reject: 'Rechazar',
        requestLabel: 'Solicitud: ',
        reasonLabel: 'Motivo: ',
        approveFailed: 'Error al aprobar: {code}',
        rejectFailed: 'Error al rechazar: {code}',
        pendingBadge: '{count} pendientes',
        action: { add: 'Añadir', modify: 'Modificar', delete: 'Eliminar' },
        originalLabel: 'Original:',
        requestedLabel: 'Solicitada:',
        targetLabel: 'Registro:',
      },
      export: {
        title: 'Exportar CSV mensual',
        monthLabel: 'Mes (AAAA-MM)',
        download: 'Descargar CSV',
        generating: 'Generando…',
        failed: 'Exportación fallida: {code}',
      },
      correct: {
        modify: 'Modificar',
        delete: 'Eliminar',
        addPunch: 'Añadir fichaje',
        modalAddTitle: 'Añadir fichaje',
        modalModifyTitle: 'Modificar fichaje',
        modalDeleteTitle: 'Eliminar fichaje',
        employeeLabel: 'Empleado',
        typeLabel: 'Tipo',
        timeLabel: 'Hora',
        reasonLabel: 'Motivo',
        reasonPlaceholder: 'Motivo de la corrección (se conserva para auditoría)',
        selectEmployee: 'Seleccionar empleado',
        save: 'Guardar',
        saving: 'Guardando…',
        cancel: 'Cancelar',
        confirmDelete: 'Confirmar eliminación',
        correctedBadge: 'corregido',
        errors: {
          BAD_ACTION: 'Acción no válida.',
          BAD_REASON: 'El motivo es obligatorio.',
          BAD_KIND: 'Tipo no válido.',
          BAD_TIME: 'Formato de hora no válido.',
          FUTURE_TIME: 'La hora no puede ser futura.',
          BAD_EMPLOYEE: 'Selecciona un empleado.',
          BAD_TARGET: 'Fichaje objetivo no encontrado.',
          ALREADY_CHANGED: 'Este fichaje ya se modificó. Actualiza e inténtalo de nuevo.',
          NOT_FOUND: 'Fichaje objetivo no encontrado.',
          NOT_ADMIN: 'Se requieren privilegios de administrador.',
          UNKNOWN: 'Acción fallida: {code}',
        },
      },
      rules: {
        button: 'Reglas de fichaje',
        title: 'Reglas de fichaje',
        timeTitle: 'Hora de fichaje',
        inLabel: 'Entrada',
        outLabel: 'Salida',
        locationTitle: 'Ubicación de fichaje',
        locationDesc: 'Debe estar a menos de {distance} de una oficina',
        close: 'Cerrar',
      },
      corrections: {
        button: 'Historial de correcciones',
        title: 'Historial de correcciones',
        none: 'Sin correcciones todavía',
        byAdmin: 'Cambio directo por {admin} · {time}',
        submittedBy: 'Enviada por {name} · {time}',
        reviewedBy: 'Revisada por {name} · {time}',
        truncated: 'Mostrando las {count} más recientes',
      },
    },
    language: { label: 'Idioma' },
  },
};
