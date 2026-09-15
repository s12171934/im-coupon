import {it,expect} from 'vitest';
import {manualTrigger} from './manual-trigger';
it('시민과 가중치를 명령에 전달한다',()=>{
 expect(manualTrigger.toCommand({citizenId:'cit-001',weights:{salesRecovery:0.3}})).toEqual({trigger:'manual',citizenId:'cit-001',weights:{salesRecovery:0.3}});
});
it('누락 시민은 서비스 검증에 넘긴다',()=>{
 expect(manualTrigger.toCommand(undefined).citizenId).toBe('');
});
