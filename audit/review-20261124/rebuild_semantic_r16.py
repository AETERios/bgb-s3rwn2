"""Rebuild generated cloze defaults; never change source questions or personal overrides.
Requires jieba in the adjacent WorkBuddy segmentation-deps directory.
"""
from pathlib import Path
import sys,json,re,collections,warnings,logging
warnings.filterwarnings('ignore',category=UserWarning)
ROOT=Path(__file__).resolve().parents[2]
WORK=Path('C:/Users/eilot/WorkBuddy/2026-11-21-21-40-53')
sys.path.insert(0,str(WORK/'segmentation-deps'))
import jieba
import jieba.posseg as posseg
jieba.setLogLevel(logging.ERROR)
data=json.loads((WORK/'cloze_tool_data.json').read_text(encoding='utf-8'))
items=data['items']; byid={i['id']:i for i in items}
manual=[i for i in items if i.get('has_custom')]
# Include the old question-answer conversions that lacked auto=1.
html=(ROOT/'index.html').read_text(encoding='utf-8')
bank=json.loads(re.search(r'<script[^>]*id="bank-data"[^>]*>([\s\S]*?)</script>',html)[1])
manual_file=Path('C:/Users/eilot/Documents/xwechat_files/wxid_7vight14tejx22_e0e7/msg/file/2026-11/拾光-挖空标注-2026-11-24.json')
manual_ids={i['id'] for i in json.loads(manual_file.read_text(encoding='utf-8'))['items']}
allowed=[{'id':q['i'],'text':q.get('x') or re.sub(r'\{\{blank:(\d+)\}\}',lambda m:q['a'][int(m[1])-1],q['q'])} for q in bank['q'] if q['k']=='f' and (q.get('auto')==1 or (q.get('_r')==1 and q.get('_ask'))) and q.get('clozeOrigin')!='source' and q['i'] not in manual_ids]
# The examples repeatedly cover roles, actions, objects, conditions, numbers and whole lists.
# No per-question cap and no first-occurrence-only matching.
STOP=set('是 为 分为 包括 称为 指 系指 即 进行 实行 必须 应当 应 要 按照 根据 通过 对于 以及 或者 不得 不应 不能 可以 需要 应该 负责 及时 认真 有关 相关 规定 内容 情况 问题 方面 要求 工作 开展 加强 提高 确保 保证 具有 作为 成为 坚持 贯彻 落实 主要 重要 一般 基本 正确 其他 各种 各级 等等 分别 所有 存在 发生 作出 做出 达到 不超过 超过 不大于 不小于 不低于 不高于 大于 小于 以上 以下 以内 以外 不断 增强 提出 采用 使用时 其中 同时 之一 代表'.split())
FUNCTION_EDGE=re.compile(r'^[的地得与及和或在由将把对按为是应]|[的地得与及和或在由将把对按]$')
PUNCT=re.compile(r'[，。；：:、！？\n\r{}]')
lex=set()
def add(w):
 w=w.strip(' \t“”\"\'‘’《》()（）')
 if 2<=len(w)<=28 and not PUNCT.search(w) and not FUNCTION_EDGE.search(w) and w not in STOP and not re.search(r'\s|不超过|不低于|不得|应当|必须',w):lex.add(w)
for i in manual:
 for a,b in i['custom_marks']:add(i['text'][a:b])
# Original exam answers supply complete domain terminology, not broken generated answers.
html=(ROOT/'index.html').read_text(encoding='utf-8')
bank=json.loads(re.search(r'<script id="bank-data"[^>]*>([\s\S]*?)</script>',html).group(1))
verified={q['i'] for q in bank['q'] if q.get('clozeOrigin')=='source'}
for i in items:
 if i['id'] in verified:
  for a in i.get('a',[]):
   if isinstance(a,str) and len(a)<=12 and not re.search(r'的|一般|数量|左右|[0-9]|按|应|以上|以下|负责|进行',a):add(a)
TERMS='车机联控 重要信息 一般信息 联控信息卡 报告时间 调车联控 联控信息 核查处理 立岗接车 就地立岗接车 补控 逐个确认 调车信号 信号显示 列车无线调度通信设备 无线调车灯显设备 列车运行监控装置 调车作业 车站助理值班员 车站值班员 机车乘务员 机车乘务组 列检人员 车务人员 调车人员 车辆乘务员 随车机械师 公安机关 安全技术部 运营总部安委会 机务段 车务部门 机务处 司机 调车信号显示正确 行车安全 人身安全 事故救援 特殊情况 正常作业 规定地点 问路式 一班一卡制 安装 摘解 连结 拆卸 使用 管理 维修 传递 处理 反馈 配备 调车 试风 保管期限 生产安全事故 政治领导力 思想引领力 群众组织力 社会号召力 社会主义现代化 全体人民共同富裕 物质文明 精神文明 人与自然和谐共生 和平发展道路 全面 系统 整体 统一指挥 集中领导 逐级负责 勤俭节约 实事求是 解放思想 自力更生 艰苦奋斗'.split()
STOP.update('运行 系统 过程 方面 及 与 和'.split())
for w in TERMS+['人类命运共同体','全人类共同价值','正式党员','预备党员','党支部委员','党支部书记','党员车间主任','总风缸压力','机车制动缸压力','单阀全制位','停放制动','人力制动机','防溜铁鞋','机车全部动态活件','驻寓干部','按时到岗','对口交接','外公寓管理制度','正式党员之日','社会主义社会','共产主义最高理想','社会发展','党支部委员会','尊重劳动','人类发展前沿','发文部门名称','规范化简称','澄清正名','消除不良影响','时期','显示方式','鱼尾形黑线','黄色鱼尾形牌','高举头上','左右摇动','首词','英勇奋斗','不怕牺牲','不畏艰险','百折不挠','万众一心','敢于胜利','无私奉献','马克思主义中国化时代化','时代大势','人类发展前沿','人民心声','现实需要','机车运用安全信息管理系统','道岔表示器','道岔位置','直向','侧向','紫色灯光','黄色灯光','中央监察委员会','最高理想','太行精神','车辆限界','电气化铁路','平交道口','货物装载高度','本务机车','重联机车','附挂回送机车','机车运用安全信息管理系统']:add(w)
# Mine whole parallel items. Repeated items are retained at every position later.
for i in allowed:
 for m in re.finditer(r'[^，。；：:\n、（）()]+(?:、[^，。；：:\n、（）()]+)+',i['text']):
  parts=m.group().split('、')
  for j,w in enumerate(parts):
   if j==0:
    head=re.split(r'分为|包括|分别是|是指|为|有|：|:|构建|安装|购买|提供|配备',w)
    if len(head)==1 and not (m.start()>0 and i['text'][m.start()-1] in '：:'):continue
    w=head[-1]
   w=re.sub(r'^(?:构建|安装|购买|配备|提供)','',w)
   if j==len(parts)-1:w=re.sub(r'方面$','',w)
   if j==len(parts)-1:w=re.split(r'以及|并且|等|，|。',w)[0]
   for v in re.split(r'以及|和|与|或',w):
    if len(v)<=18 and not re.search(r'应|必须|不得|可以|负责|进行|称为|规定|数量|一般|按|的|左右|相一致|[0-9]',v):add(v)
for w in '才能 充分 准确 勇于 现实 内涵 体系 业务 下同 算起 产生 存在 基础 方式 实现 原因 景色 季节 集中 深化 着力 结果 不足 位置 名额 齐全 空额 规范化'.split():STOP.add(w)
ACTIONS=set('安装 摘解 连结 拆卸 使用 管理 维修 传递 处理 反馈 配备 调车 试风 补控 停车 发车 通知 呼叫 确认 制动 缓解 减速 加速 扣留 隔离 摘挂 连挂 开放 关闭 切断 联系 汇报 登记 报告 检查 检测 监控 指挥 复诵 警告 避让 防护 撤除 移动 下压 展开 拢起 构建 编挂'.split())
for i in items:
 if i.get('k') in ['c','m']:
  for option in i.get('options',[]):
   if isinstance(option,str) and 2<=len(option)<=18 and not re.search(r'的|一般|数量|左右|[0-9]|按|应|以上|以下|负责|进行|是|不|，|、|和|与|或',option):add(option)
for w in lex:jieba.add_word(w,freq=200000,tag='v' if w in ACTIONS else 'nz')
for w in ACTIONS:jieba.add_word(w,freq=200000,tag='v')
for w in '时 中 上 下 内 外 前 后'.split():STOP.add(w)
for w in '铁路营业线 铁路施工 救援起重机 维修专用车辆 运行揭示调度命令 列车调度员 车站值班员 施工负责人 铁路局调度所值班主任 左侧单方向运行 反方向运行 正方向区间 线路封锁施工 自然灾害 中断行车 行车方式 设备变化 客运列车 客室车门 铁路机车 机车乘务员 列车运行监控装置 列车运行监控记录装置 自轮运转特种设备 接触网作业车 大型养路机械 警冲标 分界点 安全防护距离'.split():add(w)
TERM_RE=re.compile('|'.join(re.escape(t) for t in sorted(lex,key=lambda t:(-len(t),t)) if len(t)>=4 and not re.search(r'及|以及',t) and not re.match(r'构建|安装|购买',t)))
# Protect semantic compound boundaries and function words; numbers retain attached units.
NUM=re.compile(r'(?:\d{4}年\d{1,2}月\d{1,2}日|\d{4}年\d{1,2}月|\d+(?:\.\d+)?(?:%|％|km/h|km|kPa|MPa|mm|cm|m/s|m|h|min|s|℃|吨|千米|公里|米|毫米|分钟|小时|秒|年|月|日|天|个月|周|次|级|辆|人|项|个|种|条|号|元|台|类|ｍ)?)',re.I)
ACTIONS=set('安装 摘解 连结 拆卸 使用 管理 维修 传递 处理 反馈 配备 调车 试风 补控 停车 发车 通知 呼叫 确认 制动 缓解 减速 加速 扣留 隔离 摘挂 连挂 开放 关闭 切断 联系 汇报 登记 报告 检查 检测 监控 指挥 复诵 警告 避让 防护 撤除 移动 下压 展开 拢起'.split())
ACCEPT=lambda word,tag:tag.startswith(('n','a')) or tag in ['j','l','i','eng'] or (tag.startswith('v') and (word in ACTIONS or len(word)>=4))
# Semantic corrections reviewed against full sentences; every repeated occurrence is marked.
OVERRIDES={
 'p-0001':['重要信息','一般信息'],
 'p-0002':['调车','试风','规定地点','就地立岗接车','车站值班员','司机'],
 'p-0003':['一方未主动联控','及时补控','前方进路','司机','调车人员','逐个确认','调车信号显示正确','臆测'],
 'p-0005':['报告时间','地点','车次','姓名','准确性'],
 'p-0006':['传递','处理','反馈','24h','12h','接收单位'],
 'p-0007':['参控车间','当班参控人员','列车无线调度通信设备','作用良好'],
 'p-0008':['问路式','逐站逐列','呼唤应答'],
 'p-0009':['行车','人身安全','优先于','特殊情况','事故救援','其他人员','不得擅自','列车无线调度通信设备'],
 'p-0010':['联控信息卡','车机联控','调车联控','一班一卡制'],
 'p-0011':['2年'],
 'p-0012':['DZ1D'],
 'p-0013':['无线调车灯显设备','机务段','使用','车务部门','管理','维修'],
 'p-0014':['变换车次','车站值班员','信号员','司机','××次变开××次','复诵'],
 'd-0934':['分配的名额','党支部','推荐提名','多数党组织和党员意见','代表候选人推荐人选'],
 'd-1177':['政治领导力','思想引领力','群众组织力','社会号召力'],
 'd-1412':['亚洲','非洲','欧洲','大洋洲','北美洲','南美洲','南极洲'],
 'd-1622':['唱念做打','四种','四项','舞蹈化形体动作'],
 'd-1510':['朔望月','月相变化','朔','新月','29.5306天'],
 'd-1444':['宫商角徵羽','土','金','木','火','水'],
 'd-1526':['多京制','长安','京师','西京','洛阳','东都','太原','北都','北京','三都'],
 'p-0245':['总风缸压力','700kPa','机车制动缸压力','300kPa','单阀全制位','停放制动','人力制动机','防溜铁鞋'],
 'd-1781':['商洽函','告知函','询问函','请批函','审批函','答复函','便函'],
 'd-0974':['伤病住院','婚丧嫁娶','特殊困难','家庭矛盾纠纷','家访','疏通思想','沟通感情','后顾之忧'],
 'p-0502':['全部动态活件','完整登记','机车运行日志','清晰准确','不得隐瞒机车故障'],
 'd-0799':['书记','副书记','组织委员','宣传委员','纪检委员','群工委员','党支部委员'],
 'p-0421':['驻寓干部','按时到岗','对口交接','乘务员','值班员','外公寓管理制度','向段反馈'],
 'd-0480':['人类命运共同体','和平','发展','公平','正义','民主','自由','全人类共同价值'],
 'd-0588':['党龄','预备党员','正式党员','预备期满转为正式党员之日'],
 'd-1704':['双簧','曲艺艺术','两个人都姓黄'],
 'd-0986':['党支部','总支','党员突击队','党员车间主任','班组长','党支部书记'],
 'd-0377':['党籍','被批准为预备党员之日'],
 'd-1624':['李清照','绿肥红瘦','仲夏'],
 'd-1841':['纪要','不加盖印章','分送','主送','抄送'],
 'p-0798':['准许列车进入车场或车站','展开','黄色信号旗','高举头上','左右摇动','黄色灯光'],
 'd-0388':['带头学习提高','带头争创佳绩','带头服务群众','带头遵纪守法','带头弘扬正气'],
 'd-0432':['诬告陷害','澄清正名','消除不良影响'],
 'd-1144':['人才强国战略','尊重劳动','尊重知识','尊重人才','尊重创造','人才战略布局','世界重要人才中心','创新高地','人才国际竞争','比较优势','党和人民事业'],
 'd-1821':['发文部门署名','发文部门全称','规范化简称','发文部门标志','标题中发文部门名称'],
 'd-0943':['8%','12%','1个'],
 'd-1088':['建设指标体系','考评体系','结果考评','过程管理','重考评轻创建','重基础强管理'],
 'd-1458':['四方之海','天下','全国'],
 'd-1714':['苏东坡','兄弟','思念'],
 'd-0843':['领导机构','选配齐全','不要留空额','党支部书记人选'],
 'sg-0321-d1':['客运列车运行过程中','车门故障','客室车门打开'],
 'd-1022':['现代化铁路基础设施体系','现代化铁路运输服务体系','现代化铁路科技创新体系','现代化铁路安全保障体系','现代化铁路经营管理体系','现代化铁路治理体系'],
 'd-1943':['花圈','挽联','300元'],
 'd-0076':['中共五大','第一次','中央监察委员会'],
 'd-0238':['马克思主义中国化时代化','时代大势','人类发展前沿','人民心声','现实需要'],
 'p-0433':['派班室','机车运用安全信息管理系统','跨段写卡管理软件','乘务自助出退勤管理系统','10'],
 'p-0691':['本务机车次位','重联机车次位','2','特殊隔离'],
 'p-0084':['电气化铁路平交道口','车辆限界','货物装载高度','4.5米','２ｍ','严禁坐人'],
 'dv-0005':['精心组织','机车','机车乘务员','优质高效','科学合理使用','推广先进经验','遵循经济规律','机车运用效率','资产回报','安全风险管理','行车','人身安全','职工队伍建设','政治素质','技术素质','业务水平'],
}
def validate(text,marks):
 last=0
 for a,b in marks:
  assert isinstance(a,int) and 0<=a<b<=len(text) and a>=last
  assert not PUNCT.search(text[a:b]) or (a>0 and b<len(text) and text[a-1]=='《' and text[b]=='》'),repr(text[a:b])
  assert text[a:b]==text[a:b].strip()
  last=b

def generate(i):
 text=i['text'];cand=[]
 def put(a,b,priority,reason):
  if a<b and text[a:b].strip():cand.append((priority,a,b,reason))
 body_start=text.find('答：')+2 if '答：' in text else 0
 if i['id'] in OVERRIDES:
  for phrase in OVERRIDES[i['id']]:
   assert phrase in text,(i['id'],phrase)
   for m in re.finditer(re.escape(phrase),text):put(*m.span(),100,'逐句校订')
 else:
  for m in re.finditer(r'《([^《》\n]{2,70})》',text):put(*m.span(1),90,'文件全名')
  for m in re.finditer(r'[“‘]([^“”‘’\n]{2,24})[”’]',text):
   if not PUNCT.search(m.group(1)) and not re.search(r'四力|四个|六个|两个',m.group(1)):put(*m.span(1),90,'完整专名')
  for m in NUM.finditer(text):
   if m.start()>0 and text[m.start()-1] in '（(' and text[m.end():m.end()+1] in '）)':continue
   put(*m.span(),85,'数值与单位')
  for m in re.finditer(r'[一二三四五六七八九十百]+(?:届|个月|周年|小时|分钟)',text):put(*m.span(),85,'届次或时间')
  for m in TERM_RE.finditer(text):put(*m.span(),88,'完整知识点')
  tokens=[];cursor=0
  for t in posseg.cut(text):
   a=cursor;b=a+len(t.word);cursor=b;tokens.append((a,b,t.word,t.flag))
  # Keep full lexicon terms. Combine adjacent ordinary nouns into a complete noun phrase.
  idx=0
  while idx<len(tokens):
   a,b,w,tag=tokens[idx]
   if len(w)>=2 and w not in STOP and ACCEPT(w,tag) and not PUNCT.search(w) and not FUNCTION_EDGE.search(w):
    end=idx+1
    if tag.startswith('n') and not tag.startswith('nr'):
     while end<len(tokens):
      na,nb,nw,nt=tokens[end]
      if nb-a>22 or nw in STOP or not nt.startswith('n') or nt.startswith('nr') or len(nw)==1 or not nw.strip() or FUNCTION_EDGE.search(nw) or PUNCT.search(nw):break
      b=nb;end+=1
    if not re.search(r'^[\s\W]+$|[{}]',text[a:b]):put(a,b,80 if end>idx+1 else 75 if w in lex else 50,'完整术语、主体、动作或对象')
    idx=end
   else:idx+=1
 # Longest reviewed terms win; never merge separate knowledge points across conjunctions.
 cand=[c for c in cand if c[1]>=body_start]
 occupied=set();marks=[];reasons=[]
 for pri,a,b,why in sorted(cand,key=lambda c:(-c[0],-(c[2]-c[1]),c[1])):
  if not any(n in occupied for n in range(a,b)):
   occupied.update(range(a,b));marks.append([a,b]);reasons.append(why)
 marks.sort();validate(text,marks)
 return marks,sorted(set(reasons))
# Explicit full phrases for the reported class of back-regulation questions.
OVERRIDES['U-B-R0007']=['限速','行车方式','设备变化','运行揭示调度命令','司机','施工提前','延迟','列车调度员','取消前发运行揭示调度命令','车站值班员','施工负责人','重新发布全部内容的调度命令']
OVERRIDES['U-B-R0008']=['双线区间','左侧单方向运行','整理列车运行','反方向运行','旅客列车','正方向区间','线路封锁施工','自然灾害','事故中断行车','铁路局调度所值班主任']
result={}
for item in allowed:
 marks,reasons=generate(item)
 if marks:result[item['id']]={'x':item['text'],'m':marks}
# An unresolved source remains excluded; don't invent a knowledge point.
result.pop('d-1715',None)
block='<script id="semantic-cloze-data" type="application/json">'+json.dumps(result,ensure_ascii=False,separators=(',',':'))+'</script>\n'
if 'id="semantic-cloze-data"' in html:
 html=re.sub(r'<script id="semantic-cloze-data"[^>]*>[\s\S]*?</script>\n?',lambda m:block,html,count=1)
else:html=html.replace('<script id="bank-data"',block+'<script id="bank-data"',1)
(ROOT/'index.html').write_text(html,encoding='utf-8')
report={'eligible':len(allowed),'rebuilt':len(result),'convertedQA':sum(q.get('_r')==1 and q['i'] in result for q in bank['q']),'protectedManual':len(manual_ids),'zero':[i['id'] for i in allowed if i['id'] not in result],'examples':{id:[v['x'][a:b] for a,b in v['m']] for id,v in result.items() if id in ['U-B-R0007','U-B-R0008','dv-0001']}}
(ROOT/'audit/review-20261124/semantic-r16-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False).encode()[:3700].decode('utf-8','ignore'))
