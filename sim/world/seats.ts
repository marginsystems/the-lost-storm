import type { PropDef, PropSeat, ZoneDef, ZoneProp } from '../content/types.ts';

const RADIANS_PER_DEGREE: number = Math.PI / 180;

export interface ZoneSeat {
  readonly prop: string;
  readonly x: number;
  readonly z: number;
  readonly facing: number;
}

export function seatAt(seat: PropSeat, placed: ZoneProp): ZoneSeat {
  const angle: number = placed.rotationDegrees * RADIANS_PER_DEGREE;
  const facing: number = angle + seat.facingDegrees * RADIANS_PER_DEGREE;
  return {
    prop: placed.prop,
    x: placed.x + seat.x * Math.cos(angle) + seat.z * Math.sin(angle),
    z: placed.z - seat.x * Math.sin(angle) + seat.z * Math.cos(angle),
    facing: Math.atan2(Math.sin(facing), Math.cos(facing)),
  };
}

export function zoneSeats(zone: ZoneDef, props: ReadonlyMap<string, PropDef>): readonly ZoneSeat[] {
  return zone.props.flatMap((placed: ZoneProp): ZoneSeat[] => {
    const seat: PropSeat | null = placed.when.length > 0 ? null : (props.get(placed.prop)?.seat ?? null);
    return seat === null ? [] : [seatAt(seat, placed)];
  });
}
