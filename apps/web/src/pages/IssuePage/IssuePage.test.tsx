import {render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {it,expect,vi,afterEach} from 'vitest';
import {IssuePage} from './IssuePage';
vi.mock('../../features/my-coupons/hooks/use-citizens',()=>({useCitizens:()=>({state:{status:'loaded',citizens:[{id:'cit-001',name:'시민 하나'}]}})}));
const issue=vi.fn();
vi.mock('../../features/issuance/hooks/use-issue-coupon',()=>({useIssueCoupon:()=>({state:{status:'idle'},issue:(...args:unknown[])=>issue(...args)})}));
afterEach(()=>vi.clearAllMocks());
it('시민 선택 전 발급을 막고 선택한 시민을 전달한다',async()=>{
 const user=userEvent.setup();render(<IssuePage storage={{kind:'loading'}} />);
 const button=screen.getByRole('button',{name:'발급 1건 실행'});expect(button).toBeDisabled();
 await user.selectOptions(screen.getByLabelText('발급받을 시민'),'cit-001');
 await user.click(button);
 await waitFor(()=>expect(issue).toHaveBeenCalledWith({personalFit:'',salesRecovery:''},'cit-001'));
 expect(screen.queryByText('랜덤 신호')).not.toBeInTheDocument();
});
