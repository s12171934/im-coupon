/**
 * 쿠폰을 받는 시민. 이번 프로토타입에는 로그인이 없어 시민 선택이 로그인을 대신하므로,
 * 화면이 목록에서 고를 수 있을 만큼의 최소 필드만 둔다.
 */
export interface Citizen {
  /** `cit-` 접두. `citizens` 컬렉션 안에서 유일하다 */
  id: string;
  name: string;
}
