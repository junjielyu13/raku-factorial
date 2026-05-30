// Company identity + per-employee DNI for the compliance PDF (registro de
// jornada). PLACEHOLDERS for now — fill these in with the real values.
//
// - COMPANY_INFO: appears on every report sheet.
// - EMPLOYEE_DNI: keyed by the employee's email; missing entries render as '___'.

export interface CompanyInfo {
  name: string;
  cif: string;
}

export const COMPANY_INFO: CompanyInfo = {
  name: '___', // TODO: razón social, e.g. "Raku Sant Cugat SL"
  cif: '___',  // TODO: CIF, e.g. "B12345678"
};

export const EMPLOYEE_DNI: Record<string, string> = {
  // 'empleado@ejemplo.es': '12345678Z',
};
