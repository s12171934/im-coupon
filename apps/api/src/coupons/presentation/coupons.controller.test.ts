import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { beforeEach,afterEach,it,expect } from 'vitest';
import { JsonFileDb } from '@im-coupon/db';
import { AppModule } from '../../app.module';
import { DATA_DIR } from '../../shared/infrastructure/data-dir.token';
import { resolveSeedDir } from '../../shared/infrastructure/data-dir';
import { ISSUE_CLOCK } from '../application/coupons.service';
let app:INestApplication,dir:string,db:JsonFileDb;
beforeEach(async()=>{
 dir=await mkdtemp(join(tmpdir(),'recovery-issue-'));db=new JsonFileDb(dir);
 await db.bootstrapFromSeed(resolveSeedDir());
 const module=await Test.createTestingModule({imports:[AppModule]}).overrideProvider(DATA_DIR).useValue(dir)
   .overrideProvider(ISSUE_CLOCK).useValue(()=>new Date('2026-09-16T03:00:00Z')).compile();
 app=module.createNestApplication();app.setGlobalPrefix('api');await app.init();
});
afterEach(async()=>{await app?.close();if(dir)await rm(dir,{recursive:true,force:true});});
const issue=(body:unknown)=>request(app.getHttpServer()).post('/api/coupons/issue').send(body);
it('시민을 고정하고 가중평균으로 발급·저장한다',async()=>{
 const response=await issue({citizenId:'cit-002'});expect(response.status).toBe(201);
 expect(response.body.coupon.ownerId).toBe('cit-002');
 expect(response.body.decision.candidateCount).toBe(12);
 expect(response.body.decision.scores).not.toHaveProperty('random');
 expect(response.body.decision.salesRecovery.enabled).toBe(true);
 expect(response.body.decision.salesRecovery.sourceKind).toBe('mock');
 const {scores,appliedWeights,total}=response.body.decision;
 expect(total).toBeCloseTo((scores.personalFit*appliedWeights.personalFit+scores.salesRecovery*appliedWeights.salesRecovery)/(appliedWeights.personalFit+appliedWeights.salesRecovery));
 expect(await db.readCollection('coupons')).toEqual(expect.arrayContaining([expect.objectContaining({id:response.body.coupon.id})]));
});
it('후보 하나의 통계 누락이면 전체 회복을 끄고 개인화로 재정규화한다',async()=>{
 const rows=await db.readCollection<Record<string,unknown>>('district-consumption-monthly');
 await db.writeCollection('district-consumption-monthly',rows.filter(r=>!(r.categoryCode==='I21201'&&r.month==='202605')));
 const response=await issue({citizenId:'cit-001',weights:{personalFit:0,salesRecovery:1}});
 expect(response.status).toBe(201);expect(response.body.decision.appliedWeights).toEqual({personalFit:1,salesRecovery:0});
 expect(response.body.decision.scores.salesRecovery).toBeNull();
 expect(response.body.decision.salesRecovery.unavailableMerchants.length).toBeGreaterThan(0);
});
it('같은 입력의 동점 처리는 반복해도 일정하고 쿠폰 ID는 다르다',async()=>{
 await db.writeCollection('personal-fit-events',[]);
 const first=await issue({citizenId:'cit-001',weights:{personalFit:1,salesRecovery:0}});
 const second=await issue({citizenId:'cit-001',weights:{personalFit:1,salesRecovery:0}});
 expect(first.body.coupon.merchantId).toBe('mer-001');expect(second.body.coupon.merchantId).toBe('mer-001');
 expect(first.body.coupon.id).not.toBe(second.body.coupon.id);
});
it.each([
 [{},400,'MISSING_CITIZEN_ID'],[{citizenId:4},400,'MISSING_CITIZEN_ID'],
 [{citizenId:'missing'},404,'UNKNOWN_CITIZEN'],[{citizenId:'cit-001',weights:{random:1}},400,'INVALID_WEIGHTS'],
 [{citizenId:'cit-001',weights:{personalFit:0,salesRecovery:0}},400,'INVALID_WEIGHTS'],
 [{citizenId:'cit-001',weights:[]},400,'INVALID_BODY'],
])('잘못된 입력은 저장하지 않는다: %j',async(body,status,code)=>{
 const before=await db.readCollection('coupons');const response=await issue(body);
 expect(response.status).toBe(status);expect(response.body.error.code).toBe(code);expect(await db.readCollection('coupons')).toEqual(before);
});
it('빈 가게 목록은 후보 없음으로 거부한다',async()=>{
 await db.writeCollection('merchants',[]);expect((await issue({citizenId:'cit-001'})).status).toBe(422);
});
