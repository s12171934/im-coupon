/** 쿠폰을 발행하는 가맹점. 이번 프로토타입에서는 시드로만 들어오고 읽기 전용이다. */
export interface Merchant {
  /** `mer-` 접두. `merchants` 컬렉션 안에서 유일하다 */
  id: string;
  name: string;
  /** 업종 표시용 자유 문자열. 코드가 분기하지 않으므로 열거형으로 좁히지 않는다 */
  category: string;
}
