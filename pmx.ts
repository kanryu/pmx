///<reference path="./node.d.ts" />

/**
 *  PMXファイルをparseし、JSON形式で吐き出すパーサ
 *
 * PMXとはMMDのモデル形式PMDから派生した3Dモデル用ファイルフォーマットで、PMXEditor等でサポートされています。
 * http://kkhk22.seesaa.net/category/14045227-1.html
 *
 * 本ライブラリはPMXのモデルデータを解析し、他のモデル形式にコンバートしたり、
 * ブラウザ上で直接取り扱えるようにするために開発されたpure JavaScript実装のパーサです。
 */



/**
 *  スタック化されたポインタを持つバイナリストリーマ
 */
export class BufferReader {
	public pos_stack = [0];
	constructor(public bin:NodeBuffer, position:number=0) {
		if(position)this.pos_stack[0] = position;
	}
	push_pos(pos:number) {
		this.pos_stack.unshift(pos);
	}
	pop_pos():number {
		var result = this.pos_stack.shift();
		if(this.pos_stack.length == 0) {
			this.pos_stack[0] = result;
		}
		return result;
	}
	pos():number {
		return this.pos_stack[0];
	}
	ahead(size:number) {
		var result = this.pos_stack[0];
		this.pos_stack[0] += size;
		return result;
	}
	readByte() {
		return this.bin.readUInt8(this.ahead(1));
	}
	readShort() {
		return this.bin.readUInt16LE(this.ahead(2));
	}
	readInt() {
		return this.bin.readUInt32LE(this.ahead(4));
	}
	readFloat() {
		return this.bin.readFloatLE(this.ahead(4));
	}
	readFloatArray(len:number) {
		var result = [];
		for(var i = 0; i < len; i++) {
			result.push(this.readFloat());
		}
		return result;
	}
	readFloat2() {
		return this.readFloatArray(2);
	}
	readFloat3() {
		return this.readFloatArray(3);
	}
	readFloat4() {
		return this.readFloatArray(4);
	}
	readTextBuf(encode:string) {
		var textlen = this.readInt();
		var text = this.bin.toString(encode, this.pos(), this.pos()+textlen);
		this.pos_stack[0] += textlen;
		return new TextBuf(textlen, text);
	}
	readByteArray(len:number) {
		var result = [];
		for(var i = 0; i < len; i++) {
			result.push(this.readByte());
		}
		return result;
	}
	readShortArray(len:number) {
		var result = [];
		for(var i = 0; i < len; i++) {
			result.push(this.readShort());
		}
		return result;
	}
	readIntArray(len:number) {
		var result = [];
		for(var i = 0; i < len; i++) {
			result.push(this.readInt());
		}
		return result;
	}
	readSizedIdx(size:number, signed=true):number {
		var result = -1;
		switch(size) {
		case 1:
			result = this.readByte();
			if(signed && result == 0xff) result = -1;
			break;
		case 2:
			result = this.readShort();
			if(signed && result == 0xffff) result = -1;
			break;
		case 4:
			result = this.readInt();
			if(signed && result == 0xffffffff) result = -1;
			break;
		}
		return result;
	}
}

export class TextBuf {
	constructor(public len:number, public value:string) {
	}
}

/**
 *  Vertex１つ分の情報を格納する
 */
export class Vertex {
	public len:number;
	public pos:number[];
	public norm:number[];// normal vector
	public uv:number[];
	public uv_append = [];
	public type:number;
	public bones = [];
	public weight = [];
	public sdef = [];
	public edge:number;
	public value = {};
	constructor(reader: BufferReader, uv_append:number, bone_size:number) {
		// 12 : float3  | 位置(x,y,z)
		this.pos = this.value['pos'] = reader.readFloat3();
		// 12 : float3  | 法線(x,y,z)
		this.norm = this.value['norm'] = reader.readFloat3();
		// 8  : float2  | UV(u,v)
		this.uv = this.value['uv'] = reader.readFloat2();
		
		//16 * n : float4[n] | 追加UV(x,y,z,w)  PMXヘッダの追加UV数による
		//n:追加UV数 0～4
		if(uv_append) {
			for(var i = 0; i < uv_append; i++) {
				this.uv_append.push(reader.readFloat4());
			}
			this.value['uv_append'] = this.uv_append;
		}

		// 1 : byte    | ウェイト変形方式 0:BDEF1 1:BDEF2 2:BDEF4 3:SDEF
		this.type = this.value['type'] = reader.readByte();
		switch(this.type) {
		case 0:// BDEF1
			// n : ボーンIndexサイズ  | ウェイト1.0の単一ボーン(参照Index)
			this.bones.push(reader.readSizedIdx(bone_size));
			this.value['bones'] = this.bones;
			break;
		case 1:// BDEF2
			//  n : ボーンIndexサイズ  | ボーン1の参照Index
			//  n : ボーンIndexサイズ  | ボーン2の参照Index
			for(var i = 0; i < 2; i++) {
				this.bones.push(reader.readSizedIdx(bone_size));
			}
			this.value['bones'] = this.bones;
			//4 : float              | ボーン1のウェイト値(0～1.0), ボーン2のウェイト値は 1.0-ボーン1ウェイト
			this.weight.push(reader.readFloat());
			this.value['weight'] = this.weight;
			break;
		case 2:// BDEF4
			//  n : ボーンIndexサイズ  | ボーン1の参照Index
			//  n : ボーンIndexサイズ  | ボーン2の参照Index
			//  n : ボーンIndexサイズ  | ボーン3の参照Index
			//  n : ボーンIndexサイズ  | ボーン4の参照Index
  			for(var i = 0; i < 4; i++) {
				this.bones.push(reader.readSizedIdx(bone_size));
			}
			this.value['bones'] = this.bones;
			//  4 : float              | ボーン1のウェイト値
			//  4 : float              | ボーン2のウェイト値
			//  4 : float              | ボーン3のウェイト値
			//  4 : float              | ボーン4のウェイト値 (ウェイト計1.0の保障はない)
			// weight of bone[1-4]
			for(var i = 0; i < 4; i++) {
				this.weight.push(reader.readFloat());
			}
			this.value['weight'] = this.weight;
			break;
		case 3:// SDEF
			//  n : ボーンIndexサイズ  | ボーン1の参照Index
			//  n : ボーンIndexサイズ  | ボーン2の参照Index
			for(var i = 0; i < 2; i++) {
				this.bones.push(reader.readSizedIdx(bone_size));
			}
			this.value['bones'] = this.bones;
			//  4 : float              | ボーン1のウェイト値(0～1.0), ボーン2のウェイト値は 1.0-ボーン1ウェイト
			this.weight.push(reader.readFloat());
			this.value['weight'] = this.weight;
			
			// 12 : float3             | SDEF-C値(x,y,z)
			// 12 : float3             | SDEF-R0値(x,y,z)
			// 12 : float3             | SDEF-R1値(x,y,z) ※修正値を要計算
			//SDEF-C,SDEF-R0,SDEF-R1
			for(var i = 0; i < 3; i++) {
				this.sdef.push(reader.readFloat3());
			}
			this.value['sdef'] = this.sdef;
			break;
		}
		this.edge = this.value['edge'] = reader.readFloat();
	}
}

/**
 *  面１つ分の情報を格納
 */
export class Face {
	value: number[];
	constructor(reader: BufferReader, vertex_size:number) {
		// n : 頂点Indexサイズ     | 頂点の参照Index
		switch(vertex_size) {
		case 1:
			this.value = reader.readByteArray(3);
			break;
		case 2:
			this.value = reader.readShortArray(3);
			break;
		case 4:
			this.value = reader.readIntArray(3);
			break;
		}
	}
}

/**
 * 材質
 */
export class Material {
	public name:TextBuf;
	public name_en:TextBuf;
	public diffuse:number[];
	public specular:number[];
	public specular_mod:number;
	public ambient:number[];
	public bit_flag:number;
	public edge_color:number[];
	public edge_size:number;
	
	public textureIdx:number;
	public sphereIdx:number;
	public sphere_mode:number;
	public shared_toon:number;
	public toon:number;
	public memo:TextBuf;
	public refs_vertex:number;
	public value = {};

	constructor(reader: BufferReader, encode:string, index_size:number) {
		// 4 + n : TextBuf	| 材質名
		this.name = this.value['name'] = reader.readTextBuf(encode);
		// 4 + n : TextBuf	| 材質名英
		this.name_en = this.value['name_en'] = reader.readTextBuf(encode);
		// 16 : float4	| Diffuse (R,G,B,A)
		this.diffuse = this.value['diffuse'] = reader.readFloat4();
		// 12 : float3	| Specular (R,G,B)
		this.specular = this.value['specular'] = reader.readFloat3();
		// 4  : float	| Specular係数
		this.specular_mod = this.value['specular_mod'] = reader.readFloat();
		// 12 : float3	| Ambient (R,G,B)
		this.ambient = this.value['ambient'] = reader.readFloat3();
		// 1  : bitFlag  	| 描画フラグ(8bit) - 各bit 0:OFF 1:ON
		//0x01:両面描画, 0x02:地面影, 0x04:セルフシャドウマップへの描画, 0x08:セルフシャドウの描画, 
		//0x10:エッジ描画
		this.bit_flag = this.value['bit_flag'] = reader.readByte();
		// 16 : float4	| エッジ色 (R,G,B,A)
		this.edge_color = this.value['edge_color'] = reader.readFloat4();
		// 4  : float	| エッジサイズ
		this.edge_size = this.value['edge_size'] = reader.readFloat();
		
		// n  : テクスチャIndexサイズ     | 通常テクスチャ, テクスチャテーブルの参照Index
		this.textureIdx = this.value['textureIdx'] = reader.readSizedIdx(index_size);
		// n  : テクスチャIndexサイズ     | スフィアテクスチャ, テクスチャテーブルの参照Index  ※テクスチャ拡張子の制限なし
		this.sphereIdx = this.value['sphereIdx'] = reader.readSizedIdx(index_size);
		// 1  : byte	| スフィアモード 0:無効 1:乗算(sph) 2:加算(spa) 3:サブテクスチャ
		this.sphere_mode = this.value['sphere_mode'] = reader.readByte();
		// 1  : byte	| 共有Toonフラグ 0:継続値は個別Toon 1:継続値は共有Toon
		this.shared_toon = this.value['shared_toon'] = reader.readByte();
		// shared toon idx, or specialized toon texture idx
		this.toon = this.value['toon'] = this.shared_toon ? reader.readByte() : reader.readSizedIdx(index_size);
		// 4 + n : TextBuf	| メモ : 自由欄／スクリプト記述／エフェクトへのパラメータ配置など
		this.memo = this.value['memo'] = reader.readTextBuf(encode);
		// 4  : int	| 材質に対応する面(頂点)数 (必ず3の倍数になる)
		this.refs_vertex = this.value['refs_vertex'] = reader.readInt();
	}
}

/**
 * ボーン
 */
export class Bone {
	public name:TextBuf;
	public name_en:TextBuf;
	public position:number[];
	public parent_idx:number;
	public morph_idx:number;
	public bit_flag:number;
	
	public connect_idx:number;
	public offset:number[];
	public invest_parent_idx:number;
	public invest_rate:number;
	public axis_vector:number[];
	public x_axis_vector:number[];
	public z_axis_vector:number[];
	public parent_key:number;
	public ik_target_idx:number;
	public ik_loop_len:number;
	public ik_rad_limited:number;
	public ik_linkLen:number;
	public ik_links:Object[];
	public value = {};
	
	constructor(reader: BufferReader, encode:string, bone_size:number) {
		//4 + n : TextBuf	| ボーン名
		this.name = this.value['name'] = reader.readTextBuf(encode);
		//4 + n : TextBuf	| ボーン名英
		this.name_en = this.value['name_en'] = reader.readTextBuf(encode);
		//12 : float3	| 位置
		this.position = this.value['position'] = reader.readFloat3();
		//n  : ボーンIndexサイズ  | 親ボーンのボーンIndex
		this.parent_idx = this.value['parent_idx'] = reader.readSizedIdx(bone_size);
		//4  : int		| 変形階層
		this.morph_idx = this.value['morph_idx'] = reader.readInt();
		//2  : bitFlag*2	| ボーンフラグ(16bit) 各bit 0:OFF 1:ON
		// 0x0001  : 接続先(PMD子ボーン指定)表示方法 -> 0:座標オフセットで指定 1:ボーンで指定
		// 0x0002  : 回転可能
		// 0x0004  : 移動可能
		// 0x0008  : 表示
		// 0x0010  : 操作可
		// 0x0020  : IK
		// 0x0080  : ローカル付与 | 付与対象 0:ユーザー変形値／IKリンク／多重付与 1:親のローカル変形量
		// 0x0100  : 回転付与
		// 0x0200  : 移動付与
		// 0x0400  : 軸固定
		// 0x0800  : ローカル軸
		// 0x1000  : 物理後変形
		// 0x2000  : 外部親変形
		this.bit_flag = this.value['bit_flag'] = reader.readShort();

		if(this.bit_flag & 0x1) {
			// n  : ボーンIndexサイズ  | 接続先ボーンのボーンIndex
			this.connect_idx = this.value['connect_idx'] = reader.readSizedIdx(bone_size);
		} else {
			// 12 : float3	| 座標オフセット, ボーン位置からの相対分
			this.offset = this.value['offset'] = reader.readFloat3();
		}
		
		if(this.bit_flag & 0x0300) {
			// n  : ボーンIndexサイズ  | 付与親ボーンのボーンIndex
			this.invest_parent_idx = this.value['invest_parent_idx'] = reader.readSizedIdx(bone_size);
			// 4  : float	| 付与率
			this.invest_rate = this.value['invest_rate'] = reader.readFloat();
		}
		if(this.bit_flag & 0x0400) {
			// 12 : float3	| 軸の方向ベクトル
			this.axis_vector = this.value['axis_vector'] = reader.readFloat3();
		}
		if(this.bit_flag & 0x0800) {
			// 12 : float3	| X軸の方向ベクトル
			this.x_axis_vector = this.value['x_axis_vector'] = reader.readFloat3();
			// 12 : float3	| Z軸の方向ベクトル ※フレーム軸算出方法は後述
			this.z_axis_vector = this.value['z_axis_vector'] = reader.readFloat3();
		}
		if(this.bit_flag & 0x2000) {
			//  4  : int  	| Key値
			this.parent_key = this.value['parent_key'] = reader.readInt();
		}
		if(this.bit_flag & 0x0020) {
			// n  : ボーンIndexサイズ  | IKターゲットボーンのボーンIndex
			this.ik_target_idx = this.value['ik_target_idx'] = reader.readSizedIdx(bone_size);
			// 4  : int  	| IKループ回数 (PMD及びMMD環境では255回が最大になるようです)
			this.ik_loop_len = this.value['ik_loop_len'] = reader.readInt();
			// 4  : float	| IKループ計算時の1回あたりの制限角度 -> ラジアン角 | PMDのIK値とは4倍異なるので注意
			this.ik_rad_limited = this.value['ik_rad_limited'] = reader.readFloat();
			// 4  : int  	| IKリンク数 : 後続の要素数
			this.ik_linkLen = this.value['ik_linkLen'] = reader.readInt();
			this.ik_links = [];
			for(var i = 0; i < this.ik_linkLen; i++) {
				var ik_link = {
					//   n  : ボーンIndexサイズ  | リンクボーンのボーンIndex
					'link_idx': reader.readSizedIdx(bone_size),
				};
				//   1  : byte	| 角度制限 0:OFF 1:ON
				ik_link['rad_limited'] = reader.readByte();
				if(ik_link['rad_limited']) {
					// 12 : float3	| 下限 (x,y,z) -> ラジアン角
					ik_link['lower_vector'] = reader.readFloat3();
					// 12 : float3	| 上限 (x,y,z) -> ラジアン角
					ik_link['upper_vector'] = reader.readFloat3();
				}
				this.ik_links.push(ik_link);
			}
			this.value['ik_links'] = this.ik_links;
		}
	}
}

/**
 * モーフ
 */
export class Morph {
	public name:TextBuf;
	public name_en:TextBuf;
	public panel:number;
	public type:number;
	public offset_count:number;
	public value = {};
	
	public morph_idx:number;
	public morph_rate:number;
	
	public vertex_idx:number;
	public coodinate_offset:number[];
	
	public bone_idx:number;
	public distance:number[];
	public turning:number[];
	
//	public vertex_idx:number;
	public uv_offset:number[];
	
	public material_idx:number;
	public offset_type:number;
	public diffuse:number[];
	public specular:number[];
	public specular_mod:number;
	public ambient:number[];
	public edge_color:number[];
	public edge_size:number;
	public texture_mod:number[];
	public sphere_mod:number[];
	public toon_mod:number[];
	public offset_data = [];
	
	constructor(reader: BufferReader, encode:string, vertex_size:number, material_size:number, bone_size:number, morph_size:number) {
		// 4 + n : TextBuf	| モーフ名
		this.name = this.value['name'] = reader.readTextBuf(encode);
		// 4 + n : TextBuf	| モーフ名英
		this.name_en = this.value['name_en'] = reader.readTextBuf(encode);
		// 1  : byte	| 操作パネル (PMD:カテゴリ) 1:眉(左下) 2:目(左上) 3:口(右上) 4:その他(右下)  | 0:システム予約
		this.panel = this.value['panel'] = reader.readByte();
		// 1  : byte	| モーフ種類 - 0:グループ, 1:頂点, 2:ボーン, 3:UV, 4:追加UV1, 5:追加UV2, 6:追加UV3, 7:追加UV4, 8:材質
		this.type = this.value['type'] = reader.readByte();
		// 4  : int  	| モーフのオフセット数 : 後続の要素数
		this.offset_count = this.value['offset_count'] = reader.readInt();
		var offset_data = [];
		for(var i = 0; i < this.offset_count; i++) {
			var offset = {};
			switch(this.type) {
			case 0://グループモーフ
				//n  : モーフIndexサイズ  | モーフIndex  ※仕様上グループモーフのグループ化は非対応とする
				this.morph_idx = offset['morph_idx'] = reader.readSizedIdx(morph_size);
				//4  : float	| モーフ率 : グループモーフのモーフ値 * モーフ率 = 対象モーフのモーフ値
				this.morph_rate = offset['morph_rate'] = reader.readFloat();
				break;
			case 1://頂点モーフ
				//n  : 頂点Indexサイズ  | 頂点Index
				this.vertex_idx = offset['vertex_idx'] = reader.readSizedIdx(vertex_size);
				//12 : float3	| 座標オフセット量(x,y,z)
				this.coodinate_offset = offset['coodinate_offset'] = reader.readFloat3();
				break;
			case 2://ボーンモーフ
				//n  : ボーンIndexサイズ  | ボーンIndex
				this.bone_idx = offset['bone_idx'] = reader.readSizedIdx(bone_size);
				//12 : float3	| 移動量(x,y,z)
				this.distance = offset['distance'] = reader.readFloat3();
				//16 : float4	| 回転量-クォータニオン(x,y,z,w)
				this.turning = offset['turning'] = reader.readFloat4();
				break;
			case 3://UVモーフ
			case 4://追加UV1
			case 5://追加UV2
			case 6://追加UV3
			case 7://追加UV4
				//n  : 頂点Indexサイズ  | 頂点Index
				this.vertex_idx = offset['vertex_idx'] = reader.readSizedIdx(vertex_size);
				//16 : float4	| UVオフセット量(x,y,z,w) ※通常UVはz,wが不要項目になるがモーフとしてのデータ値は記録しておく
				this.uv_offset = offset['uv_offset'] = reader.readFloat4();
				break;
			case 8://材質モーフ
				//n  : 材質Indexサイズ  | 材質Index -> -1:全材質対象
				this.material_idx = offset['material_idx'] = reader.readSizedIdx(material_size);
				//1  : オフセット演算形式 | 0:乗算, 1:加算 - 詳細は後述
				this.offset_type = offset['offset_type'] = reader.readByte();
				//16 : float4	| Diffuse (R,G,B,A) - 乗算:1.0／加算:0.0 が初期値となる(同以下)
				this.diffuse = offset['diffuse'] = reader.readFloat4();
				//12 : float3	| Specular (R,G,B)
				this.specular = offset['specular'] = reader.readFloat3();
				//4  : float	| Specular係数
				this.specular_mod = offset['specular_mod'] = reader.readFloat();
				//12 : float3	| Ambient (R,G,B)
				this.ambient = offset['ambient'] = reader.readFloat3();
				//16 : float4	| エッジ色 (R,G,B,A)
				this.edge_color = offset['edge_color'] = reader.readFloat4();
				//4  : float	| エッジサイズ
				this.edge_size = offset['edge_size'] = reader.readFloat();
				//16 : float4	| テクスチャ係数 (R,G,B,A)
				this.texture_mod = offset['texture_mod'] = reader.readFloat4();
				//16 : float4	| スフィアテクスチャ係数 (R,G,B,A)
				this.sphere_mod = offset['sphere_mod'] = reader.readFloat4();
				//16 : float4	| Toonテクスチャ係数 (R,G,B,A)
				this.toon_mod = offset['toon_mod'] = reader.readFloat4();
				break;
			}
			this.offset_data.push(offset);
		}
		this.value['offset_data'] = this.offset_data;
	}
}

/**
 * 表示枠
 */
export class Frame {
	public name:TextBuf;
	public name_en:TextBuf;
	public flag:number;
	public inner_count:number;
	public inner_data = [];
	public value = {};

	constructor(reader: BufferReader, encode:string, bone_size:number, morph_size:number) {
		// 4 + n : TextBuf	| 枠名
		this.name = this.value['name'] = reader.readTextBuf(encode);
		// 4 + n : TextBuf	| 枠名英
		this.name_en = this.value['name_en'] = reader.readTextBuf(encode);
		// 1  : byte	| 特殊枠フラグ - 0:通常枠 1:特殊枠
		this.flag = this.value['flag'] = reader.readByte();
		// 4  : int  	| 枠内要素数 : 後続の要素数
		this.inner_count = this.value['inner_count'] = reader.readInt();
		for(var i = 0; i < this.inner_count; i++) {
			var inner = {};
			// 1 : byte	| 要素対象 0:ボーン 1:モーフ
			inner['type'] = reader.readByte();
			if(inner['type']) {
				//n  : モーフIndexサイズ  | モーフIndex
				inner['morph_idx'] = reader.readSizedIdx(morph_size);
			} else {
				//n  : ボーンIndexサイズ  | ボーンIndex
				inner['bone_idx'] = reader.readSizedIdx(bone_size);
			}
			this.inner_data.push(inner);
		}
		this.value['inner_data'] = this.inner_data;
	}
}

/**
 * 剛体
 */
export class RigidBody {
	public name:TextBuf;
	public name_en:TextBuf;
	public bone_idx:number;
	public group:number;
	public nocollision_group:number;
	public figure:number;
	public size:number[];
	public position:number[];
	public rad:number[];
	public mass:number;
	public moving_att:number;
	public rad_att:number;
	public bounce_force:number;
	public frictical_force:number;
	public mode:number;
	public value = {};

	constructor(reader: BufferReader, encode:string, bone_size:number, morph_size:number) {
		// 4 + n : TextBuf	| 剛体名
		this.name = this.value['name'] = reader.readTextBuf(encode);
		// 4 + n : TextBuf	| 剛体名英
		this.name_en = this.value['name_en'] = reader.readTextBuf(encode);
		// n  : ボーンIndexサイズ  | 関連ボーンIndex - 関連なしの場合は-1
		this.bone_idx = this.value['bone_idx'] = reader.readSizedIdx(bone_size);
		// 1  : byte	| グループ
		this.group = this.value['group'] = reader.readByte();
		//2  : ushort	| 非衝突グループフラグ
		this.nocollision_group = this.value['nocollision_group'] = reader.readSizedIdx(2);
		//1  : byte	| 形状 - 0:球 1:箱 2:カプセル
		this.figure = this.value['figure'] = reader.readByte();
		//12 : float3	| サイズ(x,y,z)
		this.size = this.value['size'] = reader.readFloat3();
		//12 : float3	| 位置(x,y,z)
		this.position = this.value['position'] = reader.readFloat3();
		//12 : float3	| 回転(x,y,z) -> ラジアン角
		this.rad = this.value['rad'] = reader.readFloat3();
		//4  : float	| 質量
		this.mass = this.value['mass'] = reader.readFloat();
		//4  : float	| 移動減衰
		this.moving_att = this.value['moving_att'] = reader.readFloat();
		//4  : float	| 回転減衰
		this.rad_att = this.value['moving_att'] = reader.readFloat();
		//4  : float	| 反発力
		this.bounce_force = this.value['bounce_force'] = reader.readFloat();
		//4  : float	| 摩擦力
		this.frictical_force = this.value['frictical_force'] = reader.readFloat();
		//
		//1  : byte	| 剛体の物理演算 - 0:ボーン追従(static) 1:物理演算(dynamic) 2:物理演算 + Bone位置合わせ
		this.mode = this.value['mode'] = reader.readByte();
	}
}

/**
 * Joint
 */
export class Joint {
	public name:TextBuf;
	public name_en:TextBuf;
	public type:number;
	public rigid_a_idx:number;
	public rigid_b_idx:number;
	public position:number[];
	public rad:number[];
	public position_lower_vector:number[];
	public position_upper_vector:number[];
	public rad_lower_vector:number[];
	public rad_upper_vector:number[];
	public baunce_moving:number[];
	public baunce_rad:number[];
	public value = {};

	constructor(reader: BufferReader, encode:string) {
		// 4 + n : TextBuf	| Joint名
		this.name = this.value['name'] = reader.readTextBuf(encode);
		// 4 + n : TextBuf	| Joint名英
		this.name_en = this.value['name_en'] = reader.readTextBuf(encode);
		// 1  : byte	| Joint種類 - 0:スプリング6DOF   | PMX2.0では 0 のみ(拡張用)
		this.type = this.value['type'] = reader.readByte();
		if(this.type) {
			throw new Error('not implemented');
		}
		//n  : 剛体Indexサイズ  | 関連剛体AのIndex - 関連なしの場合は-1
		this.rigid_a_idx = this.value['rigid_a_idx'] = reader.readByte();
		//n  : 剛体Indexサイズ  | 関連剛体BのIndex - 関連なしの場合は-1
		this.rigid_b_idx = this.value['rigid_b_idx'] = reader.readByte();
		//12 : float3	| 位置(x,y,z)
		this.position = this.value['position'] = reader.readFloat3();
		//12 : float3	| 回転(x,y,z) -> ラジアン角
		this.rad = this.value['rad'] = reader.readFloat3();
		//12 : float3	| 移動制限-下限(x,y,z)
		this.position_lower_vector = this.value['position_lower_vector'] = reader.readFloat3();
		//12 : float3	| 移動制限-上限(x,y,z)
		this.position_upper_vector = this.value['position_upper_vector'] = reader.readFloat3();
		//12 : float3	| 回転制限-下限(x,y,z) -> ラジアン角
		this.rad_lower_vector = this.value['rad_lower_vector'] = reader.readFloat3();
		//12 : float3	| 回転制限-上限(x,y,z) -> ラジアン角
		this.rad_upper_vector = this.value['rad_upper_vector'] = reader.readFloat3();
		//
		//12 : float3	| バネ定数-移動(x,y,z)
		this.baunce_moving = this.value['baunce_moving'] = reader.readFloat3();
		//12 : float3	| バネ定数-回転(x,y,z)
		this.baunce_rad = this.value['baunce_rad'] = reader.readFloat3();
	}
}


export class Pmx {
	public log = [];
	public value = {};
	constructor(bin: NodeBuffer, callback: (err, data: any) => any) {
		
		this.push(bin.toString('ascii', 0, 4));
		
		var reader = new BufferReader(bin, 4);
		var version = reader.readFloat();
		var headersize = reader.readByte();
		this.push(version);
		this.push(headersize);

		var encodeId = reader.readByte();
		var encode = encodeId ? 'utf8' : 'utf16le';
		this.push('encode', encode);
		var uv_append = reader.readByte();
		this.push('uv', uv_append);
		var vertex_size = reader.readByte();
		this.push('vertex', vertex_size);
		var texture_size = reader.readByte();
		this.push('texture', texture_size);
		var material_size = reader.readByte();
		this.push('material', material_size);
		var bone_size = reader.readByte();
		this.push('bone', bone_size);
		var morph_size = reader.readByte();
		this.push('morph', morph_size);
		this.push('rigidbody', reader.readByte());
		
		var idx = 17;
		reader.push_pos(17);
		var model = reader.readTextBuf(encode);
		var modelEn = reader.readTextBuf(encode);
		var comment = reader.readTextBuf(encode);
		var commentEn = reader.readTextBuf(encode);
		var vertexLen = reader.readInt();
		
		this.push('modelname', model.value);
		this.push('modelname_en', modelEn.value);
		this.push('comment', comment.value);
		this.push('comment_en', commentEn.value);
		this.push('VertexLen', vertexLen);

		// vertex
		var vertex_list = [];
		for(var i = 0; i < vertexLen; i++) {
			var vertex = new Vertex(reader, uv_append, bone_size);
			vertex_list.push(vertex.value);
		}
		this.push('veretex', vertex_list);

		// faces
		var faceLen = reader.readInt();
		var face_list = [];
		this.push('face', faceLen);
		for(var i = 0; i < faceLen/3; i++) {
			var face = new Face(reader, vertex_size);
			face_list.push(face.value);
		}
		this.push('face', face_list);

		var textureLen = reader.readInt();
		var textures = [];
		for(var i = 0; i < textureLen; i++) {
			// 4 + n : TextBuf	| テクスチャパス
			var texture = reader.readTextBuf(encode);
			textures.push(texture.value);
		}
		this.push('texture', textures);

		// Materials
		var materialLen = reader.readInt();
		var materials = [];
		for(var i = 0; i < materialLen; i++) {
			var material = new Material(reader, encode, texture_size);
			var m = material.value;
			materials.push(m);
		}
		this.push('material', materials);

		// Bones
		var boneLen = reader.readInt();
		var bones = [];
		for(var i = 0; i < boneLen; i++) {
			var bone = new Bone(reader, encode, bone_size);
			var m = bone.value;
			bones.push(m);
		}
		this.push('bones', bones);

		// Morphs
		var morphLen = reader.readInt();
		var morphs = [];
		for(var i = 0; i < morphLen; i++) {
			var morph = new Morph(reader, encode, vertex_size, material_size, bone_size, morph_size);
			var m = morph.value;
			morphs.push(m);
		}
		this.push('morphs', morphs);

		// Frames
		var frameLen = reader.readInt();
		var frames = [];
		for(var i = 0; i < frameLen; i++) {
			var frame = new Frame(reader, encode, bone_size, morph_size);
			var m = frame.value;
			frames.push(m);
		}
		this.push('frames', frames);
		
		// RigidBodys
		var rigidLen = reader.readInt();
		var rigids = [];
		for(var i = 0; i < rigidLen; i++) {
			var rigid = new RigidBody(reader, encode, bone_size, morph_size);
			var m = rigid.value;
			rigids.push(m);
		}
		this.push('rigids', rigids);

		// Joint
		var jointLen = reader.readInt();
		var joints = [];
		for(var i = 0; i < jointLen; i++) {
			var joint = new Joint(reader, encode);
			var m = joint.value;
			joints.push(m);
		}
		this.push('joints', joints);
	}
	push(key:any,value?:any,assigned=true) {
		if(value == undefined) {
			this.log.push(key);
		} else {
			if(assigned) {
				this.value[key] = value
			}
			this.log.push([key, value]);
		}
	}
}

export class Parser {
	static parse(bin: NodeBuffer, callback: (err, data: any) => any):Pmx {
		var pmx = new Pmx(bin, callback);
		if(callback) {
			callback(null, pmx.value);
		}
		return pmx;
	}
}

// Copyright 2014 KATO Kanryu(k.kanryu@gmail.com)
//
//   Licensed under the Apache License, Version 2.0 (the "License");
//   you may not use this file except in compliance with the License.
//   You may obtain a copy of the License at
//
//       http://www.apache.org/licenses/LICENSE-2.0
//
//   Unless required by applicable law or agreed to in writing, software
//   distributed under the License is distributed on an "AS IS" BASIS,
//   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//   See the License for the specific language governing permissions and
//   limitations under the License.
