// Company identity + per-employee DNI for the compliance PDF (registro de
// jornada). EMPLOYEE_DNI is still a placeholder — fill it in with real values.
//
// - COMPANY_INFO: appears on every report sheet.
// - EMPLOYEE_DNI: keyed by the employee's email; missing entries render as '___'.

export interface CompanyInfo {
  name: string;
  cif: string;
}

export const COMPANY_INFO: CompanyInfo = {
  name: 'RAKU RAKU SL',
  cif: 'B23924483',
};

export const EMPLOYEE_DNI: Record<string, string> = {
  // 'empleado@ejemplo.es': '12345678Z',
};
